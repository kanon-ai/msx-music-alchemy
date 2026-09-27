import unittest,copy
import core,opm
from realtime import LiveSession
class LiveToneTests(unittest.TestCase):
 def test_update_preserves_cursor_and_changes_pcm(self):
  for chip,index in [('OPLL',3),('SCC',12),('OPM',17)]:
   p=opm.configure(core.new_song(),True);p['bars']=2;p['tracks'][index]['notes']=[dict(id='held',start=0,duration=700,pitch=60,velocity=12)]
   a=LiveSession(p);b=LiveSession(p)
   try:
    for _ in range(4):self.assertEqual(a.pull([0]*4),b.pull([0]*4))
    q=copy.deepcopy(p);t=q['tracks'][index]
    if chip=='OPLL':t['instrument']=12
    elif chip=='SCC':t['wave']=core.wavetable('saw')
    else:t['opmPatch']['feedback']=7;t['opmPatch']['operators'][0]['tl']=10
    cursor=a.cursor;a.update_tones(q);self.assertEqual(cursor,a.cursor)
    self.assertNotEqual(a.pull([0]*4),b.pull([0]*4));self.assertEqual(a.cursor,b.cursor)
    a.update_tones(p);self.assertEqual(a.cursor,b.cursor)
   finally:a.close();b.close()
 def test_live_pitch_velocity_without_restart(self):
  for index in (0,3,12,17):
   p=opm.configure(core.new_song(),True);p['bars']=2;p['tracks'][index]['notes']=[dict(id='held',start=0,duration=700,pitch=60,velocity=12)]
   a=LiveSession(p);b=LiveSession(p)
   try:
    for _ in range(4):self.assertEqual(a.pull([0]*4),b.pull([0]*4))
    q=copy.deepcopy(p);q['tracks'][index]['notes'][0].update(pitch=72,velocity=6)
    cursor=a.cursor;a.update_tones(q);self.assertEqual(a.cursor,cursor)
    self.assertNotEqual(a.pull([0]*4),b.pull([0]*4));self.assertEqual(a.cursor,b.cursor)
    a.update_tones(p)
    bad=copy.deepcopy(q);bad['tracks'][index]['notes'][0]['start']=1
    with self.assertRaises(ValueError):a.update_tones(bad)
   finally:a.close();b.close()
 def test_reject_notes_atomically(self):
  p=core.new_song();s=LiveSession(p)
  try:
   q=copy.deepcopy(p);q['tracks'][0]['notes']=[dict(id='n',start=0,duration=24,pitch=60,velocity=12)]
   old=s.events;cursor=s.cursor
   with self.assertRaises(ValueError):s.update_tones(q)
   self.assertIs(old,s.events);self.assertEqual(cursor,s.cursor)
  finally:s.close()
if __name__=='__main__':unittest.main()
