import unittest,core
from mgs import export_mgs
class NotePatchTest(unittest.TestCase):
 def test_restore(self):
  p=core.new_song();p['tracks'][3]['instrument']=1;p['tracks'][3]['notes']=[dict(id='a',start=0,duration=48,pitch=60,velocity=10,instrument=11),dict(id='b',start=96,duration=48,pitch=62,velocity=10)]
  vals=[v for e in core.compile_song(p)['events'] for c,r,v in e['writes'] if c==1 and r==0x30]
  self.assertIn(0xb5,vals);self.assertEqual(vals[-1],0x15)
  with self.assertRaises(ValueError):export_mgs(p)
 def test_wrong_chip(self):
  p=core.new_song();p['tracks'][0]['notes']=[dict(id='a',start=0,duration=48,pitch=60,velocity=10,instrument=11)]
  with self.assertRaises(ValueError):core.validate(p)
