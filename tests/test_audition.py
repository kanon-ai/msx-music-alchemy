import unittest,copy,core,io,wave
class AuditionTests(unittest.TestCase):
 def test_chip_voices_and_overrides(self):
  p=core.new_song()
  for i in (0,3,15):
   body=dict(track=p['tracks'][i],note=dict(pitch=65,velocity=9),opllPatch=p['opllPatch'],opllRhythm=False)
   if i==3:body['note']['instrument']=12
   before=copy.deepcopy(body);q=core.audition_song(body)
   self.assertEqual(body,before);self.assertEqual(sum(len(t['notes']) for t in q['tracks']),1)
   self.assertFalse(q['loop']);self.assertEqual(q['tracks'][i]['notes'][0]['pitch'],65)
   if i==3:self.assertEqual(q['tracks'][i]['notes'][0]['instrument'],12)
   with wave.open(io.BytesIO(core.render(q))) as w:self.assertLess(w.getnframes()/w.getframerate(),1.2)
 def test_bad_pitch(self):
  p=core.new_song()
  with self.assertRaises(ValueError):core.audition_song(dict(track=p['tracks'][0],note=dict(pitch=999,velocity=9),opllPatch=p['opllPatch']))
if __name__=='__main__':unittest.main()
