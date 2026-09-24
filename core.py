"""Canonical song model and deterministic MSX register compiler (stdlib only)."""
import copy
import io
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import wave
import zipfile

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
PPQ = 96
CHIPS = {'PSG': 3, 'OPLL': 9, 'SCC': 5}
PATCH_NAMES = ['Custom', 'Violin', 'Guitar', 'Piano', 'Flute', 'Clarinet', 'Oboe', 'Trumpet', 'Organ', 'Horn', 'Synthesizer', 'Harpsichord', 'Vibraphone', 'Synth bass', 'Acoustic bass', 'Electric guitar']
DEFAULT_PATCH = [0x21, 0x21, 0x1a, 0x06, 0xf0, 0xf0, 0x0f, 0x0f]
# MIDI drum key -> (OPLL channel, rhythm bit, level register, nibble shift).
DRUMS = {36:(6,16,0x36,0),38:(7,8,0x37,0),42:(7,1,0x37,4),45:(8,4,0x38,4),49:(8,2,0x38,0)}

def wavetable(kind='triangle'):
    if kind == 'square': return [100 if i < 16 else -100 for i in range(32)]
    if kind == 'saw': return [i*8-124 for i in range(32)]
    if kind == 'sine': return [round(110*math.sin(i*math.tau/32)) for i in range(32)]
    return [round(110*(1-4*abs(i/32-.5))) for i in range(32)]

def new_song(title='Untitled signal'):
    tracks=[]
    for chip, count in CHIPS.items():
        for channel in range(count):
            tracks.append(dict(id=f'{chip.lower()}{channel+1}', name=f'{chip} {channel+1}', chip=chip, channel=channel,
                               instrument=3 if chip=='OPLL' else 0, wave=wavetable(), mute=False, notes=[]))
    return dict(format='msx-music-studio',version=1,title=title,bpm=120,ppq=PPQ,bars=4,hz=60,loop=True,loopStart=0,
                opllPatch=DEFAULT_PATCH[:],tracks=tracks)

def integer(value, low, high, label):
    if type(value) is not int or not low<=value<=high: raise ValueError(f'{label}: {low}～{high} の整数が必要です。')
    return value

def validate(song):
    if not isinstance(song,dict): raise ValueError('楽曲はJSONオブジェクトで指定してください。')
    p=copy.deepcopy(song)
    if p.get('format')!='msx-music-studio' or p.get('version')!=1: raise ValueError('未対応の楽曲形式です。')
    if not isinstance(p.get('title'),str) or len(p['title'])>120: raise ValueError('曲名は120文字以内です。')
    integer(p.get('bpm'),40,300,'BPM'); integer(p.get('bars'),1,64,'小節数')
    if p.get('ppq')!=PPQ or p.get('hz') not in (50,60): raise ValueError('PPQ=96、更新周波数=50/60Hz に対応しています。')
    if type(p.get('loop')) is not bool: raise ValueError('loop は真偽値です。')
    if type(p.get('opllRhythm',False)) is not bool: raise ValueError('opllRhythm は真偽値です。')
    end=p['bars']*384
    integer(p.get('loopStart'),0,end-1,'ループ開始位置')
    if end/PPQ*60/p['bpm']>300: raise ValueError('曲の長さは5分以内にしてください。')
    if not isinstance(p.get('opllPatch'),list) or len(p['opllPatch'])!=8: raise ValueError('OPLLカスタム音色は8バイト必要です。')
    for v in p['opllPatch']: integer(v,0,255,'OPLL音色')
    if not isinstance(p.get('tracks'),list) or len(p['tracks'])!=17: raise ValueError('17チャンネル分のトラックが必要です。')
    ids=set(); channels=set(); total=0
    for t in p['tracks']:
        if not isinstance(t,dict) or t.get('chip') not in CHIPS: raise ValueError('不正な音源です。')
        chip=t['chip']; integer(t.get('channel'),0,CHIPS[chip]-1,'チャンネル')
        if not isinstance(t.get('id'),str) or not t['id'] or t['id'] in ids: raise ValueError('トラックIDは重複できません。')
        ids.add(t['id']); key=(chip,t['channel'])
        if key in channels: raise ValueError('音源チャンネルが重複しています。')
        channels.add(key)
        if not isinstance(t.get('name'),str) or len(t['name'])>80: raise ValueError('トラック名は80文字以内です。')
        if type(t.get('mute')) is not bool: raise ValueError('mute は真偽値です。')
        integer(t.get('instrument'),0,15,'音色')
        if t.get('psgMode','tone') not in ('tone','noise','drums'): raise ValueError('PSG mode must be tone/noise/drums')
        if t.get('psgMode') in ('noise','drums') and chip!='PSG': raise ValueError('Noise mode requires PSG')
        integer(t.get('noisePeriod',16),1,31,'PSG noise period')
        integer(t.get('decayMs',0),0,2000,'PSG decay milliseconds')
        if not isinstance(t.get('wave'),list) or len(t['wave'])!=32: raise ValueError('SCC波形は32サンプル必要です。')
        for v in t['wave']: integer(v,-128,127,'SCC波形')
        if not isinstance(t.get('notes'),list): raise ValueError('notes は配列です。')
        total+=len(t['notes'])
        if total>16000: raise ValueError('最大16000音までです。')
        last=0; noteids=set()
        for n in sorted(t['notes'],key=lambda n: n.get('start',-1) if isinstance(n,dict) else -1):
            if not isinstance(n,dict): raise ValueError('ノートはオブジェクトです。')
            integer(n.get('start'),0,end-1,'開始tick'); integer(n.get('duration'),1,end,'音長tick')
            integer(n.get('pitch'),24,95,'MIDI音程'); integer(n.get('velocity'),1,15,'音量')
            if 'noisePeriod' in n:
                integer(n['noisePeriod'],1,31,'PSG note noise period')
                if chip!='PSG' or t.get('psgMode') not in ('noise','drums'): raise ValueError('Noise period requires PSG percussion mode')
            if 'decayMs' in n:
                integer(n['decayMs'],0,2000,'PSG note decay milliseconds')
                if chip!='PSG' or t.get('psgMode') not in ('noise','drums'): raise ValueError('Decay requires PSG percussion mode')
            if chip=='PSG' and t.get('psgMode')=='drums' and n['pitch'] not in DRUMS:
                raise ValueError('PSG drums: use MIDI 36/38/42/45/49')
            if p.get('opllRhythm') and chip=='OPLL' and t['channel']>=6:
                if n['pitch'] not in DRUMS or DRUMS[n['pitch']][0]!=t['channel']:
                    raise ValueError('OPLLリズム: ch7=C2(36)、ch8=D2(38)/F#2(42)、ch9=A2(45)/C#3(49) を使用してください。')
            if not isinstance(n.get('id'),str) or n['id'] in noteids: raise ValueError('ノートIDが重複しています。')
            noteids.add(n['id'])
            if n['start']<last: raise ValueError(f'{t["name"]}: 同一チャンネルで音が重なっています。')
            last=n['start']+n['duration']
            if last>end: raise ValueError('ノートが曲の終端を超えています。')
        t['notes'].sort(key=lambda n:n['start'])
    if sum(t['chip']=='PSG' and t.get('psgMode') in ('noise','drums') and not t['mute'] and bool(t['notes']) for t in p['tracks'])>1:
        raise ValueError('PSG noise generator is shared; use one noise track')
    scc={t['channel']:t for t in p['tracks'] if t['chip']=='SCC'}
    if scc[3]['wave']!=scc[4]['wave']: raise ValueError('標準SCCの4・5チャンネルは同じ波形を共有します。')
    return p

def demo_song():
    p=new_song('Starlight Circuit'); p.update(bpm=144,bars=8)
    melody=[76,79,83,79,74,78,81,78,72,76,79,76,74,78,81,86]
    def note(t,pitch,start,dur,vel):
        p['tracks'][t]['notes'].append(dict(id=f'd{t}-{start}',pitch=pitch,start=start,duration=dur,velocity=vel))
    for bar in range(8):
        root=[48,45,41,43][bar%4]
        for j in range(8):
            note(0,melody[(bar*4+j)%16]-(12 if bar>=4 and j%4==3 else 0),bar*384+j*48,36,11)
            note(12,root+12+[0,7,12,7][j%4],bar*384+j*48,42,9)
        note(3,root,bar*384,336,12)
        note(4,root+7,bar*384,336,8)
        for j in range(4): note(2,root+12,bar*384+j*96,18,8)
    p['tracks'][0]['name']='Prism lead'; p['tracks'][2]['name']='Pulse accents'
    p['tracks'][3].update(name='FM bass',instrument=14)
    p['tracks'][4].update(name='Glass harmony',instrument=12)
    p['tracks'][12]['name']='SCC arpeggio'
    return validate(p)

def compile_song(song):
    p=validate(song); hz=p['hz']; end=p['bars']*384
    frame=lambda tick: int(tick*hz*60/(p['bpm']*PPQ)+.5)
    frames=frame(end)
    if p['loop'] and frame(p['loopStart'])>=frames: raise ValueError('ループ区間は1フレーム以上必要です。')
    events=[[] for _ in range(frames+1)]
    def write(f,chip,reg,val): events[f].append([chip,reg,val])
    write(0,0,7,0xbf)
    for ch in range(3): write(0,0,8+ch,0)
    write(0,1,0x0e,0)
    for reg,val in enumerate(p['opllPatch']): write(0,1,reg,val)
    for ch in range(9): write(0,1,0x20+ch,0)
    rhythm=bool(p.get('opllRhythm')); rhythm_bits=0x20; drum_levels={0x36:15,0x37:255,0x38:255}
    if rhythm:
        # Yamaha application manual, rhythm tuning; melodic key bits stay off.
        for reg,val in [(0x16,0x20),(0x17,0x50),(0x18,0xc0),(0x26,5),(0x27,5),(0x28,1),*drum_levels.items(),(0x0e,0x20)]:
            write(0,1,reg,val)
    write(0,2,0x8f,0)
    scc={t['channel']:t for t in p['tracks'] if t['chip']=='SCC'}
    for ch in range(4):
        for i,v in enumerate(scc[ch]['wave']): write(0,2,ch*32+i,v&255)
    schedule=[]; warnings=[]
    for t in p['tracks']:
        if t['mute']: continue
        for n in t['notes']:
            on=frame(n['start']); off=frame(n['start']+n['duration'])
            if off<=on: raise ValueError(f'{t["name"]}: {n["start"]}tick の音が1フレーム未満です。BPMや音長を調整してください。')
            schedule.extend([(on,1,t,n),(off,0,t,n)])
    mixer=0xbf; enabled=0
    for f,on,t,n in sorted(schedule,key=lambda x:(x[0],x[1])):
        chip=t['chip']; ch=t['channel']; freq=440*2**((n['pitch']-69)/12)
        if chip=='PSG':
            if t.get('psgMode')=='drums':
                # One PSG voice, synthesized percussive tone/noise with frame envelope.
                # (noise period or None, pitch start/end or None, decay milliseconds)
                presets={36:(None,48,28,100),38:(17,55,50,90),42:(3,None,None,40),45:(None,55,43,140),49:(5,None,None,220)}
                noise,high,low,ms=presets[n['pitch']]
                mixer|=(1<<ch)|(1<<(ch+3))
                if on:
                    if noise is not None:
                        write(f,0,6,n.get('noisePeriod',t.get('noisePeriod',noise)));mixer&=~(1<<(ch+3))
                    if high is not None:mixer&=~(1<<ch)
                    off=frame(n['start']+n['duration'])
                    ms=n.get('decayMs',0) or t.get('decayMs',0) or ms
                    decay=max(1,round(ms*hz/1000));gate=min(off-f,decay)
                    for df in range(gate):
                        progress=df/decay
                        if high is not None:
                            pitch=high+(low-high)*min(1,progress*2)
                            period=min(4095,max(1,round(1789773/(16*440*2**((pitch-69)/12)))))
                            write(f+df,0,ch*2,period&255);write(f+df,0,ch*2+1,period>>8)
                        write(f+df,0,8+ch,max(0,round(n['velocity']*(1-progress)**2)))
                    if f+gate<off:write(f+gate,0,8+ch,0)
                else:write(f,0,8+ch,0)
                write(f,0,7,mixer)
                continue
            if t.get('psgMode')=='noise':
                mixer|=1<<ch
                if on:
                    write(f,0,6,n.get('noisePeriod',t.get('noisePeriod',16)))
                    write(f,0,8+ch,n['velocity']); mixer&=~(1<<(ch+3))
                    off=frame(n['start']+n['duration'])
                    ms=n.get('decayMs',0) or t.get('decayMs',0)
                    decay=max(1,round(ms*hz/1000)) if ms else off-f
                    for df in range(1,off-f):
                        level=max(0 if ms else 1,round(n['velocity']*max(0,1-df/decay)**2))
                        write(f+df,0,8+ch,level)
                else:
                    write(f,0,8+ch,0); mixer|=1<<(ch+3)
                write(f,0,7,mixer)
                continue
            if on:
                period=round(1789773/(16*freq))
                write(f,0,ch*2,period&255); write(f,0,ch*2+1,period>>8)
                write(f,0,8+ch,n['velocity']); mixer&=~(1<<ch)
            else: write(f,0,8+ch,0); mixer|=1<<ch
            write(f,0,7,mixer)
        elif chip=='OPLL':
            if rhythm and ch>=6:
                _,bit,reg,shift=DRUMS[n['pitch']]
                if on:
                    drum_levels[reg]=(drum_levels[reg]&~(15<<shift))|((15-n['velocity'])<<shift)
                    write(f,1,reg,drum_levels[reg]); rhythm_bits|=bit
                else: rhythm_bits&=~bit
                write(f,1,0x0e,rhythm_bits)
                continue
            block=0; fnum=round(freq*72*2**19/3579545)
            while fnum>511 and block<7:
                block+=1; fnum=round(freq*72*2**(19-block)/3579545)
            hi=(fnum>>8)|(block<<1)
            if on:
                write(f,1,0x30+ch,(t['instrument']<<4)|(15-n['velocity']))
                write(f,1,0x10+ch,fnum&255)
            write(f,1,0x20+ch,hi|(0x10 if on else 0))
        else:
            if on:
                period=round(3579545/(32*freq))-1
                write(f,2,0x80+ch*2,period&255); write(f,2,0x81+ch*2,period>>8)
                write(f,2,0x8a+ch,n['velocity']); enabled|=1<<ch
            else: write(f,2,0x8a+ch,0); enabled&=~(1<<ch)
            write(f,2,0x8f,enabled)
    # Silence every chip at the exact song end. OPLL release is retained for WAV only.
    for ch in range(3): write(frames,0,8+ch,0)
    for ch in range(9): write(frames,1,0x20+ch,0)
    if rhythm: write(frames,1,0x0e,0x20)
    write(frames,2,0x8f,0)
    if p['loop'] and p['loopStart']:
        # Re-establish register state at a nonzero loop boundary, including notes
        # that started before it. FM envelope phase restarts on subsequent loops.
        lf=frame(p['loopStart']); state={}
        for writes in events[:lf]:
            for chip,reg,value in writes: state[chip,reg]=value
        restore=[[0,7,0xbf],[2,0x8f,0]]+[[1,0x20+c,0] for c in range(9)]
        if rhythm: restore.append([1,0x0e,0x20])
        gates=[]
        for (chip,reg),value in sorted(state.items()):
            target=gates if (chip==0 and reg==7 or chip==1 and (0x20<=reg<=0x28 or rhythm and reg==0x0e) or chip==2 and reg==0x8f) else restore
            target.append([chip,reg,value])
        events[lf]=restore+gates+events[lf]
    return dict(format='msx-register-stream',version=1,hz=hz,frames=frames,loop=p['loop'],loopFrame=frame(p['loopStart']),
                clocks=dict(PSG=1789773,OPLL=3579545,SCC=3579545),chips=['PSG','OPLL','SCC'],
                events=[dict(frame=i,writes=w) for i,w in enumerate(events) if w],warnings=warnings)

def native_stream(song,tail=False):
    data=compile_song(song); count=data['frames']+1+(data['hz']//3 if tail else 0)
    if count>18060: raise ValueError('レンダリング上限を超えました。')
    out=bytearray(b'MSR1'+struct.pack('<HI',data['hz'],count)); events={e['frame']:e['writes'] for e in data['events']}
    for f in range(count):
        writes=events.get(f,[]); out+=struct.pack('<H',len(writes))
        for w in writes: out+=bytes(w)
    return bytes(out)

def render(song):
    exe=ROOT/'bin'/('msx_render.exe' if sys.platform=='win32' else 'msx_render')
    if not exe.exists(): raise ValueError('音源エンジンがありません。build.ps1 を実行してください。')
    result=subprocess.run([str(exe)],input=native_stream(song,True),capture_output=True,timeout=90,
                          creationflags=0x08000000 if sys.platform=='win32' else 0)
    if result.returncode: raise ValueError('音源エンジンでエラーが発生しました。')
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100); w.writeframes(result.stdout)
    return out.getvalue()

def binary(song):
    """Sparse frame packets: uint16 wait, uint16 count, count * (chip,reg,value)."""
    d=compile_song(song); b=bytearray(); offsets={}; previous=0
    # Empty marker guarantees exact loop target even in a rest.
    ev={e['frame']:e['writes'] for e in d['events']}; ev.setdefault(d['loopFrame'],[])
    for f,writes in sorted(ev.items()):
        offsets[f]=len(b); b+=struct.pack('<HH',f-previous,len(writes)); previous=f
        for w in writes: b+=bytes(w)
    b+=struct.pack('<HH',0xffff,0)
    return bytes(b),dict(hz=d['hz'],frames=d['frames'],loop=d['loop'],loopFrame=d['loopFrame'],loopOffset=offsets[d['loopFrame']],bytes=len(b))

def header(song):
    b,m=binary(song)
    if len(b)>65535: raise ValueError('Cヘッダー用ストリームは64KiB未満にしてください。長い曲はレジスタJSONからバンク対応ドライバに変換してください。')
    rows=['    '+', '.join(f'0x{x:02x}' for x in b[i:i+16])+',' for i in range(0,len(b),16)]
    return ('/* Generated by MSX Music Alchemy. See GAME_INTEGRATION.md. */\n#ifndef MSX_SONG_DATA_H\n#define MSX_SONG_DATA_H\n'
            f'#define MSX_SONG_HZ {m["hz"]}\n#define MSX_SONG_LOOP {int(m["loop"])}\n#define MSX_SONG_LOOP_OFFSET {m["loopOffset"]}u\n'
            f'#define MSX_SONG_SIZE {len(b)}u\nstatic const unsigned char msx_song_data[] = {{\n'+'\n'.join(rows)+'\n};\n#endif\n')

def vgm(song):
    d=compile_song(song); out=bytearray(256); out[:4]=b'Vgm '
    struct.pack_into('<I',out,8,0x171); struct.pack_into('<I',out,0x10,3579545)
    struct.pack_into('<I',out,0x24,d['hz']); struct.pack_into('<I',out,0x34,256-0x34)
    struct.pack_into('<I',out,0x74,1789773); out[0x78]=0x00 # AY-3-8910
    # VGM's K051649 core convention uses half the MSX master clock.
    # libvgm k051649_update multiplies this clock by two internally.
    struct.pack_into('<I',out,0x9c,1789773)
    current=0; samples=0; loop_position=None
    ev={e['frame']:e['writes'] for e in d['events']}; ev.setdefault(d['loopFrame'],[])
    for f,writes in sorted(ev.items()):
        wait=(f-current)*(44100//d['hz']); samples+=wait; current=f
        while wait:
            n=min(wait,65535); out+=b'\x61'+struct.pack('<H',n); wait-=n
        if f==d['loopFrame']: loop_position=len(out)
        for chip,reg,value in writes:
            if chip==0: out+=bytes([0xa0,reg,value])
            elif chip==1: out+=bytes([0x51,reg,value])
            else:
                if reg<0x80: port,addr=0,reg
                elif reg<0x8a: port,addr=1,reg-0x80
                elif reg<0x8f: port,addr=2,reg-0x8a
                else: port,addr=3,0
                out+=bytes([0xd2,port,addr,value])
    out+=b'\x66'; struct.pack_into('<I',out,4,len(out)-4); struct.pack_into('<I',out,0x18,samples)
    if d['loop']:
        struct.pack_into('<I',out,0x1c,loop_position-0x1c)
        struct.pack_into('<I',out,0x20,(d['frames']-d['loopFrame'])*(44100//d['hz']))
    return bytes(out)

def bundle(song):
    p=validate(song); raw,meta=binary(p); out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('song.msx.json',json.dumps(p,ensure_ascii=False,indent=2))
        z.writestr('registers.json',json.dumps(compile_song(p),indent=2))
        z.writestr('song.bin',raw); z.writestr('song.h',header(p)); z.writestr('song.vgm',vgm(p))
        z.writestr('manifest.json',json.dumps(meta,indent=2))
        for name in ['GAME_INTEGRATION.md','AI_COMPOSITION.md','song.schema.json','msx_player.h']:
            z.write(ROOT/'docs'/name,name)
        z.write(ROOT/'LICENSE','LICENSE')
    return out.getvalue()
