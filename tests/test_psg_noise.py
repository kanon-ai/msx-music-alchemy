import unittest,hashlib,io,wave,array,copy
import core,mgs
class NoiseTests(unittest.TestCase):
 def song(self):
  s=core.new_song();s.update(bars=1,loop=False);s['tracks'][2].update(psgMode='noise',noisePeriod=16,notes=[dict(id='n',pitch=42,start=0,duration=24,velocity=10,noisePeriod=3)]);return s
 def test_legacy(self):self.assertEqual(hashlib.sha256(core.native_stream(core.demo_song())).hexdigest(),'1ec26efaf36aa70b7b0e2f7164932b51eac005796b5d0bace6b63d734382d99e')
 def test_noise(self):
  s=self.song();d=core.compile_song(s);writes=d['events'][0]['writes'];self.assertIn([0,6,3],writes);self.assertIn([0,7,159],writes)
  levels=[v for e in d['events'] for c,r,v in e['writes'] if c==0 and r==10];self.assertIn(10,levels);self.assertIn(0,levels)
  with wave.open(io.BytesIO(core.render(s))) as w:a=array.array('h',w.readframes(w.getnframes()))
  self.assertGreater(max(map(abs,a)),10)
  self.assertTrue(core.vgm(s))
  with self.assertRaisesRegex(ValueError,'MGS'):mgs.export_mgs(s)
 def test_shared_and_range(self):
  s=self.song();s['tracks'][1].update(psgMode='noise',notes=copy.deepcopy(s['tracks'][2]['notes']))
  with self.assertRaises(ValueError):core.validate(s)
  s=self.song();s['tracks'][2]['notes'][0]['noisePeriod']=32
  with self.assertRaises(ValueError):core.validate(s)
 def test_loop_and_mute(self):
  s=self.song();s.update(loop=True,loopStart=12);d=core.compile_song(s);e=next(e for e in d['events'] if e['frame']==d['loopFrame']);self.assertIn([0,6,3],e['writes'])
  s['tracks'][2]['mute']=True
  self.assertFalse(any(c==0 and r==6 for e in core.compile_song(s)['events'] for c,r,v in e['writes']))
