import copy,unittest
import core
from arrangement_templates import apply_template
class TemplateTests(unittest.TestCase):
 def song(self):
  s=core.new_song();s['opllRhythm']=True;s['tracks'][3]['instrument']=4;s['tracks'][3]['notes']=[dict(id='a',pitch=72,start=0,duration=96,velocity=10)];return s
 def test_copy_and_source_preservation(self):
  s=self.song();old=copy.deepcopy(s);r=apply_template(s,'soft_echo','opll1','opll7');self.assertEqual(s,old);self.assertFalse(r['song']['opllRhythm']);self.assertEqual(r['song']['tracks'][3],s['tracks'][3]);self.assertEqual(r['song']['tracks'][9]['notes'][0]['velocity'],6)
  with self.assertRaises(ValueError):apply_template(r['song'],'soft_echo','opll1','opll7')
 def test_occupied_rhythm_rejected(self):
  s=self.song();s['tracks'][10]['notes']=[dict(id='d',pitch=38,start=0,duration=12,velocity=8)]
  with self.assertRaises(ValueError):apply_template(s,'soft_echo','opll1','opll7')
 def test_quiet_notes_are_not_amplified(self):
  s=self.song();s['tracks'][3]['notes'][0]['velocity']=2
  with self.assertRaises(ValueError):apply_template(s,'soft_echo','opll1','opll7')
