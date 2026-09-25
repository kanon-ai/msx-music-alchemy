import copy,io,wave,unittest
import core
from realtime import LiveSession,LivePool

class RealtimeTests(unittest.TestCase):
 def pcm(self,p):
  with wave.open(io.BytesIO(core.render(p))) as w:return w.readframes(w.getnframes())
 def drain(self,s,masks=(0,0,0)):
  out=[]
  while True:
   b=s.pull(list(masks))
   if not b:return b''.join(out)
   out.append(b)
 def test_same_audio_as_export_at_both_rates(self):
  for hz in (50,60):
   p=core.demo_song();p.update(loop=False,hz=hz)
   s=LiveSession(p)
   try:self.assertEqual(self.drain(s),self.pcm(p))
   finally:s.close()
 def test_mute_unmute_preserves_held_voice(self):
  for index,mask in ((0,[1,0,0]),(3,[0,1,0]),(12,[0,0,1])):
   p=core.new_song();p.update(loop=False,bars=2);p['tracks'][index]['notes']=[dict(id='a',start=0,duration=700,pitch=60,velocity=10)]
   a=LiveSession(p);b=LiveSession(p)
   try:
    self.assertEqual(a.pull([0,0,0]),b.pull([0,0,0]))
    for i in range(8): muted=a.pull(mask);b.pull([0,0,0])
    self.assertLess(max(abs(x) for x in __import__('array').array('h',muted)),3)
    for i in range(8): restored=a.pull([0,0,0]);normal=b.pull([0,0,0])
    self.assertTrue(any(restored));self.assertEqual(restored,normal)
   finally:a.close();b.close()
 def test_seek_and_loop(self):
  p=core.demo_song();p.update(loop=False)
  s=LiveSession(p,384)
  try:self.assertEqual(self.drain(s),self.pcm(p)[round(384*p['hz']*60/p['bpm']/96)*(44100//p['hz'])*2:])
  finally:s.close()
  p=core.new_song();p.update(bars=1,loop=True,bpm=300)
  p['tracks'][0]['notes']=[dict(id='a',start=0,duration=96,pitch=60,velocity=10)]
  s=LiveSession(p)
  try:
   for _ in range(50):self.assertTrue(s.pull([0,0,0]))
   self.assertLessEqual(s.cursor,s.total)
  finally:s.close()
 def test_alternative_muted_psg_noise_tracks(self):
  p=core.new_song();p['loop']=False
  for i in (0,1):
   p['tracks'][i].update(psgMode='noise',mute=i==1)
   p['tracks'][i]['notes']=[dict(id='n',start=0,duration=384,pitch=60,velocity=10)]
  s=LiveSession(p)
  try:
   self.assertTrue(s.pull([2,0,0]))
   self.assertTrue(s.pull([1,0,0]))
   with self.assertRaises(ValueError):s.pull([0,0,0])
  finally:s.close()

 def test_pool_stop_and_validation(self):
  pool=LivePool()
  try:
   with self.assertRaises(ValueError):pool.start(core.new_song(),-1)
   result=pool.start(core.new_song());key=result['session'];proc=pool.sessions[key].proc
   with self.assertRaises(ValueError):pool.pull(key,[0,512,0])
   pool.stop(key);self.assertIsNotNone(proc.poll())
   with self.assertRaises(ValueError):pool.pull(key,[0,0,0])
  finally:pool.close()
if __name__=='__main__':unittest.main()
