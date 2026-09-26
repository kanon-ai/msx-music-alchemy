import json,threading,unittest,urllib.request,http.client
from http.server import ThreadingHTTPServer
import core
from realtime import LivePool
from server import Handler

class DroppedResponseTests(unittest.TestCase):
 def test_retry_after_truncated_http_response(self):
  class DropOnce(Handler):
   dropped=False
   def reply(self,data,status=200,kind='application/json; charset=utf-8'):
    if kind=='application/octet-stream' and not self.dropped:
     type(self).dropped=True
     self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers()
     self.wfile.write(data[:10]);self.close_connection=True;return
    return super().reply(data,status,kind)
  server=ThreadingHTTPServer(('127.0.0.1',0),DropOnce);server.live=LivePool();server.token='test'
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   key=server.live.start(core.demo_song())['session']
   body=json.dumps(dict(session=key,masks=[0,0,0],requestId=0)).encode()
   def pull():
    req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}/api/live/pull',body,{'Content-Type':'application/json','X-Studio-Token':'test'})
    with urllib.request.urlopen(req,timeout=5) as r:return r.read()
   with self.assertRaises(http.client.IncompleteRead):pull()
   cursor=server.live.sessions[key].cursor
   self.assertEqual(pull(),server.live.sessions[key].last_pcm)
   self.assertEqual(server.live.sessions[key].cursor,cursor)
  finally:
   server.shutdown();server.server_close();thread.join();server.live.close()
