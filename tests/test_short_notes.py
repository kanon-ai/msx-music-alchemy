import unittest,copy,core
class ShortNoteTests(unittest.TestCase):
 def test_skip_without_mutation(self):
  for chip in ('PSG','OPLL','SCC'):
   for bpm in (150,186,300):
    for hz in (50,60):
     p=core.new_song();p.update(bpm=bpm,hz=hz,loop=False)
     t=next(t for t in p['tracks'] if t['chip']==chip)
     short=dict(id='tiny',pitch=60,start=0,duration=1,velocity=10)
     normal=dict(id='normal',pitch=64,start=96,duration=96,velocity=10)
     t['notes']=[short,normal];before=copy.deepcopy(p)
     actual=core.compile_song(p);self.assertEqual(p,before);self.assertEqual(len(actual['warnings']),1)
     t['notes']=[normal];expected=core.compile_song(p)
     self.assertEqual(actual['events'],expected['events'])
 def test_tempo_can_restore_note(self):
  p=core.new_song();p.update(bpm=300,loop=False);p['tracks'][0]['notes']=[dict(id='tiny',pitch=60,start=0,duration=2,velocity=10)]
  self.assertTrue(core.compile_song(p)['warnings']);p['bpm']=40
  self.assertFalse(core.compile_song(p)['warnings'])
if __name__=='__main__':unittest.main()
