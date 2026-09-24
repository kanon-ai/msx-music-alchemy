import array
import copy
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core
import mml
import mcp_server

def single(chip='PSG',pitch=69):
    p=core.new_song();p.update(bars=1,loop=False)
    t=next(t for t in p['tracks'] if t['chip']==chip)
    if chip=='OPLL': t['instrument']=4
    if chip=='SCC': t['wave']=core.wavetable('sine')
    t['notes']=[dict(id='a',pitch=pitch,start=0,duration=96,velocity=12)]
    return p,t

class ModelTests(unittest.TestCase):
    def test_demo_deterministic_and_roundtrip(self):
        p=core.demo_song();self.assertEqual(core.validate(json.loads(json.dumps(p))),p)
        self.assertEqual(core.compile_song(p),core.compile_song(p))
        self.assertEqual(len(p['tracks']),17)
    def test_overlap_and_boundaries(self):
        p,t=single();t['notes'].append(dict(id='b',pitch=72,start=90,duration=24,velocity=9))
        with self.assertRaises(ValueError):core.validate(p)
        t['notes'][-1]['start']=96;core.validate(p)
        t['notes'][-1]['duration']=400
        with self.assertRaises(ValueError):core.validate(p)
    def test_shared_wave_and_patch(self):
        p=core.new_song();p['tracks'][16]['wave'][0]=20
        with self.assertRaises(ValueError):core.validate(p)
        p['tracks'][15]['wave'][0]=20;core.validate(p)
        p['opllPatch']=[1]
        with self.assertRaises(ValueError):core.validate(p)
    def test_bad_inputs(self):
        for key,value in [('bpm',float('nan')),('bars',True),('loop','true'),('tracks',[]),('title',None)]:
            with self.subTest(key=key):
                p=core.new_song();p[key]=value
                with self.assertRaises(ValueError):core.validate(p)
    def test_register_pitch_and_gate(self):
        p,t=single();data=core.compile_song(p);events={x['frame']:x['writes'] for x in data['events']}
        regs={r:v for c,r,v in events[0] if c==0};period=regs[0]|regs[1]<<8
        self.assertLess(abs(1789773/16/period-440),2)
        self.assertIn([0,8,0],events[30]);self.assertEqual(data['frames'],120)
    def test_fm_pitch(self):
        p,t=single('OPLL');writes=core.compile_song(p)['events'][0]['writes'];regs={r:v for c,r,v in writes if c==1}
        fnum=regs[0x10]|((regs[0x20]&1)<<8);block=(regs[0x20]>>1)&7
        freq=fnum*3579545/72/2**(19-block);self.assertLess(abs(freq-440),2);self.assertTrue(regs[0x20]&0x10)
    def test_scc_pitch(self):
        p,t=single('SCC');regs={r:v for c,r,v in core.compile_song(p)['events'][0]['writes'] if c==2}
        freq=3579545/32/((regs[0x80]|regs[0x81]<<8)+1);self.assertLess(abs(freq-440),2)
    def test_too_short_and_loop_quantization(self):
        p,t=single();p['bpm']=300;t['notes'][0]['duration']=1
        with self.assertRaises(ValueError):core.compile_song(p)
        p=core.new_song();p.update(bars=1,bpm=300,loopStart=383)
        with self.assertRaises(ValueError):core.compile_song(p)
    def test_pal_timing_and_retrigger_order(self):
        p,t=single();p['hz']=50;t['notes'].append(dict(id='b',pitch=72,start=96,duration=96,velocity=12))
        data=core.compile_song(p);self.assertEqual(data['frames'],100)
        writes=next(e['writes'] for e in data['events'] if e['frame']==25)
        self.assertLess(writes.index([0,8,0]),writes.index([0,8,12]))
    def test_muted(self):
        p,t=single();t['mute']=True
        self.assertFalse(any(c==0 and r==8 and v for e in core.compile_song(p)['events'] for c,r,v in e['writes']))
    def test_nonzero_loop_restores_wave_and_pitch(self):
        p,t=single('SCC');p.update(loop=True,loopStart=48)
        e=next(e for e in core.compile_song(p)['events'] if e['frame']==15)
        self.assertTrue(any(c==2 and r==0x80 for c,r,v in e['writes']))
        self.assertTrue(any(c==2 and r==0x8f and v==1 for c,r,v in e['writes']))
    def test_binary_reconstructs_events(self):
        p=core.demo_song();raw,meta=core.binary(p);offset=0;frame=0;events=[]
        while True:
            wait,count=struct.unpack_from('<HH',raw,offset);offset+=4
            if wait==65535:break
            frame+=wait;writes=[list(raw[i:i+3]) for i in range(offset,offset+count*3,3)];offset+=count*3
            if writes:events.append(dict(frame=frame,writes=writes))
        self.assertEqual(events,core.compile_song(p)['events']);self.assertEqual(len(raw),offset)
    def test_vgm_reconstructs_stream_and_clock(self):
        p=core.demo_song();d=core.compile_song(p);raw=core.vgm(p)
        self.assertEqual(raw[:4],b'Vgm ');self.assertEqual(struct.unpack_from('<I',raw,4)[0]+4,len(raw))
        self.assertEqual(struct.unpack_from('<I',raw,0x74)[0],1789773)
        self.assertEqual(raw[0x78],0)
        self.assertEqual(struct.unpack_from('<I',raw,0x9c)[0],1789773)
        pos=256;samples=0;events={}
        while raw[pos]!=0x66:
            command=raw[pos];pos+=1
            if command==0x61: samples+=struct.unpack_from('<H',raw,pos)[0];pos+=2;continue
            if command in (0xa0,0x51): chip=0 if command==0xa0 else 1;reg,val=raw[pos:pos+2];pos+=2
            else:
                self.assertEqual(command,0xd2);chip=2;port,reg,val=raw[pos:pos+3];pos+=3;reg+=[0,0x80,0x8a,0x8f][port]
            events.setdefault(samples//735,[]).append([chip,reg,val])
        self.assertEqual([dict(frame=f,writes=w) for f,w in events.items()],d['events'])
        self.assertEqual(samples,struct.unpack_from('<I',raw,0x18)[0])
    def test_bundle_complete(self):
        with zipfile.ZipFile(io.BytesIO(core.bundle(core.demo_song()))) as z:
            self.assertEqual(z.testzip(),None)
            self.assertTrue({'song.h','song.bin','song.msx.json','msx_player.h','song.schema.json','GAME_INTEGRATION.md'}.issubset(z.namelist()))

class MmlTests(unittest.TestCase):
    def test_track_mapping_and_octaves(self):
        p=mml.import_mml('#opll_mode 0\n#tempo 144\n1 v12 o4 c4 >c4\n9 @2 v10 o3 c2')['song']
        self.assertEqual([n['pitch'] for n in p['tracks'][0]['notes']],[60,72]);self.assertEqual(p['tracks'][3]['instrument'],3)
        self.assertEqual(p['tracks'][3]['notes'][0]['pitch'],48)
    def test_dotted_raw_gate_ties_and_repeats(self):
        p=mml.import_mml('1 v12 o4 q4 l8 [2 c. r%12] d4^8')['song'];notes=p['tracks'][0]['notes']
        self.assertEqual([(n['start'],n['duration']) for n in notes],[(0,36),(96,36),(192,72)])
    def test_repeated_lines_keep_state(self):
        p=mml.import_mml('1 v12 o5 l8 c\n1 d')['song'];self.assertEqual(p['tracks'][0]['notes'][1]['pitch'],74)
    def test_default_volume_is_zero(self):
        p=mml.import_mml('1 cdef')['song'];self.assertEqual(p['tracks'][0]['notes'],[])
    def test_scc_wave(self):
        p=mml.import_mml('@s0={'+('7f'*16+'80'*16)+'}\n7 @0 v12 o4 c1')['song']
        self.assertEqual(p['tracks'][15]['wave'],p['tracks'][16]['wave']);self.assertEqual(p['tracks'][15]['wave'][16],-128)
    def test_fail_not_silently_omit(self):
        for source in ['1 v12 c h1,2,3,4','1 v12 [0c]','1 v12 c&d','#opll_mode 1\n1 v12 c','1 v12 c t180d','9 @15 v12c','4 v12 c','1 v12 c7','1 v12 q0c']:
            with self.subTest(source=source):
                with self.assertRaises(ValueError):mml.import_mml(source)

class AudioTests(unittest.TestCase):
    def test_each_chip_non_silent_and_fundamental(self):
        for chip in core.CHIPS:
            with self.subTest(chip=chip):
                p,t=single(chip);data=core.render(p)
                with wave.open(io.BytesIO(data)) as w:
                    self.assertEqual(w.getframerate(),44100);self.assertEqual(w.getnchannels(),1)
                    values=array.array('h',w.readframes(w.getnframes()))
                window=values[4410:17640];mean=sum(window)/len(window)
                self.assertGreater(max(window)-min(window),100)
                # Autocorrelation around A4 fundamental; FM preset flute has a strong fundamental.
                correlations={lag:sum((window[i]-mean)*(window[i+lag]-mean) for i in range(0,len(window)-lag,3)) for lag in range(90,111)}
                lag=max(correlations,key=correlations.get);self.assertLess(abs(44100/lag-440),12)
    def test_render_deterministic(self):
        p,t=single('OPLL');self.assertEqual(core.render(p),core.render(p))

class McpTests(unittest.TestCase):
    def test_stdio_roundtrip(self):
        messages=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25'}},{'jsonrpc':'2.0','method':'notifications/initialized'}, {'jsonrpc':'2.0','id':2,'method':'tools/list'}, {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'new_song','arguments':{'title':'Test'}}}]
        proc=subprocess.run([sys.executable,str(core.ROOT/'mcp_server.py')],input='\n'.join(json.dumps(m) for m in messages).encode(),capture_output=True,timeout=10)
        responses=[json.loads(line) for line in proc.stdout.splitlines()]
        self.assertEqual(proc.returncode,0);self.assertEqual(len(responses),3)
        self.assertEqual({t['name'] for t in responses[1]['result']['tools']}, {t['name'] for t in mcp_server.TOOLS})
        self.assertEqual(json.loads(responses[2]['result']['content'][0]['text'])['title'],'Test')
    def test_invalid_tool_returns_error(self):
        response=mcp_server.handle(dict(jsonrpc='2.0',id=1,method='tools/call',params=dict(name='validate_song',arguments={'song':{}})))
        self.assertTrue(response['result']['isError'])
    def test_export_path_and_no_overwrite(self):
        old=mcp_server.OUTPUT
        with tempfile.TemporaryDirectory() as temp:
            mcp_server.OUTPUT=Path(temp)
            try:
                args=dict(song=core.demo_song(),format='json',filename='../escape')
                with self.assertRaises(ValueError):mcp_server.call('export_song',args)
                args['filename']='test';mcp_server.call('export_song',args)
                with self.assertRaises(FileExistsError):mcp_server.call('export_song',args)
            finally:mcp_server.OUTPUT=old

if __name__=='__main__':unittest.main()
