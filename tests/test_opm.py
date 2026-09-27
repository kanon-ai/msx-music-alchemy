import copy,io,wave,struct,unittest,hashlib,json,array
from pathlib import Path
import core,opm,mcp_server
from mgs import export_mgs
from realtime import LiveSession

def song(ch=0):
 p=opm.configure(core.new_song('OPM test'),True);p.update(bars=1,loop=False)
 p['tracks'][17+ch]['notes']=[dict(id='a',start=0,duration=300,pitch=69,velocity=12)]
 return p

def pcm(p):
 with wave.open(io.BytesIO(core.render(p))) as w:return w.readframes(w.getnframes())

class OpmTests(unittest.TestCase):
 def test_optional_and_non_destructive(self):
  original=core.demo_song();p=opm.configure(original,True)
  self.assertEqual(len(original['tracks']),17);self.assertEqual(p['tracks'][:17],original['tracks'])
  self.assertEqual(len(p['tracks']),25);self.assertEqual(len(opm.configure(p,True)['tracks']),25)
  self.assertEqual(opm.configure(p,False)['tracks'],original['tracks'])
  with self.assertRaises(ValueError):opm.configure(song(),False)
 def test_reject_mgs_even_empty_or_muted(self):
  for p in (song(),opm.configure(core.new_song(),True)):
   p['tracks'][17]['mute']=True
   with self.assertRaisesRegex(ValueError,'OPM'):export_mgs(p)
 def test_validation(self):
  for mutate in (lambda p:p.update(opmEnabled=False),lambda p:p['tracks'][17]['opmPatch'].update(algorithm=8),lambda p:p['tracks'][17]['opmPatch']['operators'][0].update(tl=128),lambda p:p['tracks'][17].update(channel=8)):
   p=song();mutate(p)
   with self.assertRaises(ValueError):core.validate(p)
 def test_all_channels_and_algorithms_sound(self):
  for ch in range(8):
   p=song(ch);p['tracks'][17+ch]['opmPatch']['algorithm']=ch
   a=array.array('h',pcm(p));self.assertGreater(max(a)-min(a),50);self.assertLess(max(abs(v) for v in a),32767)
 def test_pitch(self):
  for note in (24,60,69,95):
   p=song();t=p['tracks'][17];t['notes'][0]['pitch']=note;t['opmPatch']['algorithm']=7
   for o in t['opmPatch']['operators']:o.update(tl=127,ar=31,d1r=0,d2r=0,mul=1)
   t['opmPatch']['operators'][3]['tl']=0
   a=array.array('h',pcm(p))[4410:44100];cross=sum(a[i]<=0<a[i+1] for i in range(len(a)-1));freq=cross*44100/len(a)
   self.assertLess(abs(freq/(440*2**((note-69)/12))-1),.04)
 def test_live_export_and_mute(self):
  for hz in (50,60):
   p=song();p['hz']=hz;s=LiveSession(p);chunks=[]
   try:
    while True:
     b=s.pull([0,0,0,0])
     if not b:break
     chunks.append(b)
    self.assertEqual(b''.join(chunks),pcm(p))
   finally:s.close()
  a=LiveSession(song());b=LiveSession(song())
  try:
   self.assertEqual(a.pull([0]*4),b.pull([0]*4))
   for _ in range(5):muted=a.pull([0,0,0,1]);b.pull([0]*4)
   self.assertLess(max(abs(v) for v in array.array('h',muted)),3)
   for _ in range(4):restored=a.pull([0]*4);normal=b.pull([0]*4)
   self.assertEqual(restored,normal)
  finally:a.close();b.close()
 def test_vgm_expression_and_loop(self):
  p=song();p.update(loop=True,loopStart=96)
  p['tracks'][17]['notes'][0].update(vibratoDepth=20,vibratoDelayMs=100,portamentoMs=100,portamentoFrom=67)
  d=core.compile_song(p);w=next(e['writes'] for e in d['events'] if e['frame']==d['loopFrame'])
  self.assertIn([3,8,0x78],w);self.assertGreater(sum(c==3 and r==0x28 for e in d['events'] for c,r,v in e['writes']),10)
  v=core.vgm(p);self.assertEqual(struct.unpack_from('<I',v,0x30)[0],3579545);self.assertIn(b'\x54\x08\x78',v)
 def test_mcp_preset_bank(self):
  bank=mcp_server.call('list_opm_presets',{})
  self.assertGreater(bank['count'],0)
  ids=[p['id'] for p in bank['presets']];self.assertEqual(len(ids),len(set(ids)))
  for item in bank['presets']:
   preset=mcp_server.call('get_opm_preset',dict(id=item['id']))
   p=song();p['tracks'][17]['opmPatch']=preset['patch'];core.compile_song(p)
  found=mcp_server.call('list_opm_presets',dict(query='bass'))
  self.assertGreater(found['count'],0)
  self.assertEqual(found,mcp_server.call('list_opm_presets',dict(query='BASS')))
  with self.assertRaises(ValueError):mcp_server.call('get_opm_preset',dict(id='missing'))
  with self.assertRaises(ValueError):mcp_server.call('list_opm_presets',dict(query=3))
  first=mcp_server.call('get_opm_preset',dict(id=ids[0]));first['patch']['algorithm']=99
  self.assertNotEqual(mcp_server.call('get_opm_preset',dict(id=ids[0]))['patch']['algorithm'],99)

 def test_glide_returns_to_target_and_holds(self):
  for hz in (50,60):
   p=song();p['hz']=hz
   p['tracks'][17]['notes'][0].update(portamentoFrom=65,portamentoMs=55)
   d=core.compile_song(p);target=[]
   opm.pitch(lambda f,c,r,v:target.append((r,v)),0,0,69)
   end=__import__('math').ceil(.055*hz)
   writes=[(r,v) for e in d['events'] if e['frame']==end for c,r,v in e['writes'] if c==3 and r in (0x28,0x30)]
   self.assertEqual(writes,target)
   later=[(e['frame'],r,v) for e in d['events'] if end<e['frame']<20 for c,r,v in e['writes'] if c==3 and r in (0x28,0x30)]
   self.assertEqual(later,[])

 def test_mcp_and_audition(self):
  p=mcp_server.call('configure_opm',dict(song=core.new_song(),enabled=True))
  t=p['tracks'][17];n=dict(pitch=69,velocity=12)
  preview=core.audition_song(dict(track=t,note=n,opllPatch=p['opllPatch']))
  self.assertTrue(preview['opmEnabled']);self.assertTrue(any(pcm(preview)))
  self.assertEqual(mcp_server.call('get_opm_patch_template',{})['patch'],opm.patch())
if __name__=='__main__':unittest.main()
