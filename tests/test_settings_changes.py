import unittest,copy,json
import core
class SettingsTests(unittest.TestCase):
 def test_roundtrip_playback(self):
  s=core.new_song('Changes');t=s['tracks'][3]
  for i,(v,ins) in enumerate([(10,3),(10,3),(8,5),(8,5),(10,3)]):t['notes'].append(dict(id=str(i),start=i*48,duration=40,pitch=60,velocity=v,instrument=ins))
  original=copy.deepcopy(s);c=core.compact_settings(s)
  self.assertEqual(sum('velocity' in n for n in c['tracks'][3]['notes']),3)
  self.assertEqual(sum('instrument' in n for n in c['tracks'][3]['notes']),2)
  self.assertEqual(core.compile_song(s),core.compile_song(c));self.assertEqual(s,original)
  self.assertEqual(core.compact_settings(c),c)
  for start in [0,48,100]:
   a=copy.deepcopy(s);a.update(loop=True,loopStart=start);b=core.compact_settings(a)
   self.assertEqual(core.compile_song(a),core.compile_song(b))
 def test_missing_opening_volume(self):
  s=core.new_song('Bad');s['settingsMode']='changes';s['tracks'][0]['notes']=[dict(id='n',start=0,duration=48,pitch=60)]
  with self.assertRaises(ValueError):core.validate(s)
if __name__=='__main__':unittest.main()
