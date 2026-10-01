import unittest,copy,struct
import core
class LoopEnd(unittest.TestCase):
 def test_legacy(self):
  s=core.demo_song();a=core.compile_song(s);s['loopEnd']=s['bars']*384;self.assertEqual(a,core.compile_song(s))
 def test_clip_and_preserve(self):
  s=core.demo_song();s.update(loop=True,loopStart=0,loopEnd=1810);original=copy.deepcopy(s);d=core.compile_song(s);self.assertEqual(s,original);self.assertEqual(d['frames'],round(1810*60*60/(s['bpm']*96)));self.assertLessEqual(max(e['frame'] for e in d['events']),d['frames']);self.assertEqual(core.binary(s)[1]['frames'],d['frames'])
 def test_disabled(self):
  s=core.demo_song();s['loop']=False;a=core.compile_song(s);s['loopEnd']=10;self.assertEqual(a,core.compile_song(s))
 def test_bad(self):
  for value in (0,-1,99999,True,1.5):
   s=core.demo_song();s['loopEnd']=value
   with self.assertRaises(ValueError):core.validate(s)
if __name__=='__main__':unittest.main()
