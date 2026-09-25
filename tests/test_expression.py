import unittest,core
class ExpressionTest(unittest.TestCase):
 def song(self,**kw):
  p=core.new_song();p['tracks'][3]['notes']=[dict(id='a',start=0,duration=192,pitch=60,velocity=10,**kw)];return p
 def pitches(self,p):
  return [(e['frame'],r,v) for e in core.compile_song(p)['events'] for c,r,v in e['writes'] if c==1 and r in (16,32)]
 def test_disabled_identity(self):
  self.assertEqual(core.native_stream(self.song()),core.native_stream(self.song(vibratoDepth=0,detuneCents=0,portamentoMs=0)))
 def test_delay_and_gate(self):
  rows=self.pitches(self.song(vibratoDepth=35,vibratoRate=50,vibratoDelayMs=300)); lows=[(f,v) for f,r,v in rows if r==16]
  self.assertEqual(len(set(v for f,v in lows if f<18)),1)
  self.assertGreater(len(set(v for f,v in lows if 24<f<55)),2)
  self.assertTrue(all(v&16 for f,r,v in rows if r==32 and 0<f<60))
  self.assertFalse([v for f,r,v in rows if r==32 and f==60][-1]&16)
 def test_glide(self):
  rows=self.pitches(self.song(portamentoFrom=59,portamentoMs=200)); lows=[(f,v) for f,r,v in rows if r==16 and f>0]
  self.assertGreater(len(set(v for f,v in lows if f<12)),3)
  self.assertEqual(len(set(v for f,v in lows if f>=12)),1)
