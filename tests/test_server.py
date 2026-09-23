import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import core
import server
import mcp_server

class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.old_data=server.DATA;server.DATA=Path(cls.tmp.name)
        cls.server=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.server.store=server.Store();cls.server.token='integration-test'
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}';cls.old_base=mcp_server.BASE;mcp_server.BASE=cls.url
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join();server.DATA=cls.old_data;mcp_server.BASE=cls.old_base;cls.tmp.cleanup()
    def request(self,path,body=None,headers=None):
        hdr={'X-Studio-Token':'integration-test','Content-Type':'application/json'};hdr.update(headers or {})
        return urlopen(Request(self.url+path,data=None if body is None else json.dumps(body).encode(),headers=hdr),timeout=5)
    def test_http_and_mcp_share_state_and_detect_conflict(self):
        state=mcp_server.call('get_song',{});p=state['song'];old=copy.deepcopy(p)
        result=mcp_server.call('set_track_notes',dict(trackId='psg2',revision=state['revision'],notes=[dict(id='mcp-a',pitch=60,start=0,duration=48,velocity=12)]))
        with self.request('/api/state') as r: visible=json.load(r)
        self.assertEqual(visible,result);self.assertEqual(visible['song']['tracks'][0],old['tracks'][0]);self.assertEqual(len(visible['song']['tracks'][1]['notes']),1)
        with self.assertRaises(HTTPError) as caught:self.request('/api/state',dict(song=old,revision=state['revision']))
        self.assertEqual(caught.exception.code,409)
        self.assertEqual(server.Store().song,visible['song'])
    def test_invalid_update_is_atomic(self):
        with self.request('/api/state') as r: before=json.load(r)
        invalid=copy.deepcopy(before['song']);invalid['tracks'][0]['notes'][0]['duration']=-1
        with self.assertRaises(HTTPError) as caught:self.request('/api/state',dict(song=invalid,revision=before['revision']))
        self.assertEqual(caught.exception.code,400)
        with self.request('/api/state') as r:self.assertEqual(json.load(r),before)
    def test_cross_origin_host_and_token_rejected(self):
        for headers in [{'Origin':'https://evil.invalid'},{'Host':'evil.invalid'},{'X-Studio-Token':'wrong'}]:
            with self.subTest(headers=headers):
                with self.assertRaises(HTTPError) as caught:self.request('/api/validate',dict(song=core.demo_song()),headers)
                self.assertEqual(caught.exception.code,403)
    def test_export_and_static(self):
        with self.request('/') as r:self.assertIn(b'roll-view',r.read())
        with self.request('/api/export',dict(song=core.demo_song(),format='bundle')) as r:
            self.assertEqual(r.headers['Content-Type'],'application/zip');self.assertTrue(r.read().startswith(b'PK'))
        with self.request('/api/export',dict(song=core.demo_song(),format='mgs')) as r:
            self.assertEqual(r.headers['Content-Type'],'application/octet-stream');self.assertTrue(r.read().startswith(b'MGS303\r\n'))
        p=core.demo_song();p['hz']=50
        with self.assertRaises(HTTPError) as caught:self.request('/api/export',dict(song=p,format='mgs'))
        self.assertEqual(caught.exception.code,400)
    def test_mml_error_keeps_editor_unchanged(self):
        with self.request('/api/state') as r:before=json.load(r)
        with self.assertRaises(HTTPError):self.request('/api/mml',{'text':'1 v12 c4 h1,2,3,4'})
        with self.request('/api/state') as r:self.assertEqual(json.load(r),before)

if __name__=='__main__':unittest.main()
