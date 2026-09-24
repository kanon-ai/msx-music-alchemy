import copy, io, unittest, wave, array
import core, mgs

class RhythmTests(unittest.TestCase):
 def song(self):
  s=core.new_song();s.update(opllRhythm=True,bars=1,loop=False)
  for i,(pitch,start) in enumerate([(36,0),(38,0),(42,24),(45,0),(49,24)]):
   ch=core.DRUMS[pitch][0]
   s['tracks'][3+ch]['notes'].append(dict(id=str(i),pitch=pitch,start=start,duration=12,velocity=10))
  return s
 def test_registers_and_release(self):
  d=core.compile_song(self.song());state={};bits=[]
  for e in d['events']:
   for chip,r,v in e['writes']:
    if chip==1:
     state[r]=v
     if r==14:bits.append(v)
     if r in [38,39,40]:self.assertFalse(v&16)
  self.assertIn(0x3c,bits);self.assertIn(0x23,bits)
  self.assertEqual(state[14],32);self.assertEqual(state[55],0x55);self.assertEqual(state[56],0x55)
 def test_invalid_pitch(self):
  s=self.song();s['tracks'][9]['notes'][0]['pitch']=60
  with self.assertRaises(ValueError):core.validate(s)
 def test_type_and_mgs(self):
  s=self.song()
  with self.assertRaisesRegex(ValueError,'MGS'):mgs.export_mgs(s)
  s['opllRhythm']=1
  with self.assertRaises(ValueError):core.validate(s)
 def test_muted_and_solo_audio(self):
  for key in core.DRUMS:
   s=core.new_song();s.update(opllRhythm=True,bars=1,loop=False)
   t=s['tracks'][3+core.DRUMS[key][0]];t['notes']=[dict(id='hit',pitch=key,start=0,duration=24,velocity=12)]
   with wave.open(io.BytesIO(core.render(s))) as w:a=array.array('h',w.readframes(w.getnframes()))
   self.assertGreater(max(map(abs,a)),10)
   t['mute']=True
   with wave.open(io.BytesIO(core.render(s))) as w:a=array.array('h',w.readframes(w.getnframes()))
   self.assertLessEqual(max(map(abs,a)),1)
 def test_loop_restore(self):
  s=self.song();s.update(loop=True,loopStart=6)
  d=core.compile_song(s);e=next(e for e in d['events'] if e['frame']==d['loopFrame'])
  self.assertIn([1,14,32],e['writes']);self.assertIn([1,14,0x3c],e['writes'])
if __name__=='__main__':unittest.main()
