"""Bounded live chip sessions; no complete-song PCM rendering or state writes."""
import atexit
import copy
import secrets
import struct
import subprocess
import sys
import threading
import time
import core

class LiveSession:
    def __init__(self, song, start=0):
        p=core.validate(song)
        if type(start) is not int or not 0 <= start < p['bars']*384:
            raise ValueError('再生開始位置が範囲外です。')
        # Keep silent voices running so unmute resumes their envelope and phase.
        p=copy.deepcopy(p)
        noise=[t['channel'] for t in p['tracks'] if t['chip']=='PSG' and t.get('psgMode') in ('noise','drums') and t['notes']]
        self.variants={};self.noise_channels=noise if len(noise)>1 else []
        for t in p['tracks']: t['mute']=False
        for selected in ([None]+noise if self.noise_channels else [None]):
            candidate=copy.deepcopy(p)
            if self.noise_channels:
                for t in candidate['tracks']:
                    if t['chip']=='PSG' and t['channel'] in noise:t['mute']=t['channel']!=selected
            d=core.compile_song(candidate)
            self.variants[selected]={e['frame']:e['writes'] for e in d['events']}
        self.selected_noise=None;self.restore=[]
        self.hz=d['hz']; self.total=d['frames']; self.loop=d['loop']; self.loop_frame=d['loopFrame']
        self.events=self.variants[None]
        self.cursor=0; self.lock=threading.Lock(); self.touched=time.monotonic(); self.closed=False
        self.proc=subprocess.Popen([str(core.ROOT/'bin'/('msx_render.exe' if sys.platform=='win32' else 'msx_render'))],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
            creationflags=0x08000000 if sys.platform=='win32' else 0)
        self.proc.stdin.write(b'MSR2'+struct.pack('<HI',self.hz,0));self.proc.stdin.flush()
        target=round(start*self.hz*60/(p['bpm']*96))
        try:
            while self.cursor<target:self._chunk(min(12,target-self.cursor),[0,0,0])
        except Exception:
            self.close();raise

    def _chunk(self,count,masks):
        packet=bytearray(struct.pack('<4H',count,*masks))
        for _ in range(count):
            if self.cursor==self.total and self.loop:self.cursor=self.loop_frame
            writes=self.restore+self.events.get(self.cursor,[])
            self.restore=[]
            packet+=struct.pack('<H',len(writes))
            for w in writes:packet+=bytes(w)
            self.cursor+=1
        self.proc.stdin.write(packet);self.proc.stdin.flush()
        remaining=count*(44100//self.hz)*2; chunks=[]
        while remaining:
            data=self.proc.stdout.read(remaining)
            if not data:raise ValueError('音源エンジンが停止しました。')
            chunks.append(data);remaining-=len(data)
        return b''.join(chunks)

    def pull(self,masks):
        if not isinstance(masks,list) or len(masks)!=3 or any(type(v) is not int or not 0<=v<=limit for v,limit in zip(masks,[7,511,31])):
            raise ValueError('ミュート指定が不正です。')
        with self.lock:
            if self.closed:raise ValueError('再生セッションは終了しています。')
            self.touched=time.monotonic()
            if self.noise_channels:
                audible=[ch for ch in self.noise_channels if not masks[0]&(1<<ch)]
                if len(audible)>1:raise ValueError('PSGノイズは1パートだけを有効にしてください。')
                chosen=audible[0] if audible else None
                if chosen!=self.selected_noise:
                    self.events=self.variants[chosen];self.selected_noise=chosen
                    state={r:0 for r in range(11)};state[7]=0xbf
                    for frame,writes in self.events.items():
                        if frame>=self.cursor:break
                        for chip,reg,val in writes:
                            if chip==0:state[reg]=val
                    self.restore=[[0,r,v] for r,v in state.items()]
            count=4 if self.loop else min(4,self.total+1+self.hz//3-self.cursor)
            return self._chunk(count,masks) if count>0 else b''

    def close(self):
        # Killing first also releases a read blocked in a concurrent request.
        self.closed=True
        if self.proc.poll() is None:self.proc.kill()
        self.proc.wait()
        with self.lock:
            self.proc.stdin.close();self.proc.stdout.close()

class LivePool:
    def __init__(self):
        self.sessions={};self.lock=threading.RLock()
        self.stopped=threading.Event()
        threading.Thread(target=self._reap,daemon=True).start()
        atexit.register(self.close)
    def _reap(self):
        while not self.stopped.wait(5):
            with self.lock:
                for key,s in list(self.sessions.items()):
                    if time.monotonic()-s.touched>15:
                        self.sessions.pop(key).close()
    def start(self,song,start=0):
        with self.lock:
            if len(self.sessions)>=4:raise ValueError('再生画面が多すぎます。別画面の再生を停止してください。')
            s=LiveSession(song,start);key=secrets.token_urlsafe(24);self.sessions[key]=s
            return dict(session=key,sampleRate=44100,hz=s.hz)
    def pull(self,key,masks):
        with self.lock:s=self.sessions.get(key)
        if s is None:raise ValueError('再生セッションが終了しました。再生ボタンで再開してください。')
        return s.pull(masks)
    def stop(self,key):
        with self.lock:s=self.sessions.pop(key,None)
        if s:s.close()
    def close(self):
        self.stopped.set()
        with self.lock:
            for s in self.sessions.values():s.close()
            self.sessions.clear()
