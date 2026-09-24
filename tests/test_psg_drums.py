import unittest,copy,io,wave,array
import core,mgs
class PsgDrumTests(unittest.TestCase):
 def song(self,pitch=38):
  s=core.new_song();s.update(bars=1,loop=False);s['tracks'][2].update(psgMode='drums',notes=[dict(id='hit',pitch=pitch,start=0,duration=96,velocity=10,decayMs=50)]);return s
 def test_decay_and_sweep(self):
  for pitch in (36,38,42,45,49):
   s=self.song(pitch);d=core.compile_song(s)
   volumes=[(e['frame'],v) for e in d['events'] for c,r,v in e['writes'] if c==0 and r==10]
   self.assertIn((3,0),volumes)
   self.assertFalse(any(f>3 and v>0 for f,v in volumes))
   with wave.open(io.BytesIO(core.render(s))) as w:a=array.array('h',w.readframes(w.getnframes()))
   self.assertGreater(max(map(abs,a)),10)
  d=core.compile_song(self.song(45));periods=[v for e in d['events'] for c,r,v in e['writes'] if c==0 and r==4];self.assertGreater(len(set(periods)),1)
 def test_retrigger_and_loop(self):
  s=self.song();s['tracks'][2]['notes'][0]['duration']=24;s['tracks'][2]['notes'].append(dict(id='hit2',pitch=38,start=24,duration=96,velocity=10,decayMs=50));d=core.compile_song(s)
  self.assertIn([0,10,10],next(e for e in d['events'] if e['frame']==8)['writes'])
  s.update(loop=True,loopStart=12);self.assertTrue(core.vgm(s))
 def test_noise_decay_and_validation(self):
  s=self.song();s['tracks'][2]['psgMode']='noise';d=core.compile_song(s);self.assertIn([0,10,0],next(e for e in d['events'] if e['frame']==3)['writes'])
  s=self.song();s['tracks'][2]['notes'][0]['pitch']=60
  with self.assertRaises(ValueError):core.validate(s)
  s=self.song();s['tracks'][2]['notes'][0]['decayMs']=-1
  with self.assertRaises(ValueError):core.validate(s)
  with self.assertRaises(ValueError):mgs.export_mgs(self.song())
