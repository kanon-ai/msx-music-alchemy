"""Loopback editor service. Optimistic revisions prevent GUI/MCP lost updates."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import secrets
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import core
from mgs import export_mgs
from mml import import_mml

DATA=Path(os.environ.get('MSX_MUSIC_DATA',str(Path(__file__).resolve().parent/'data')))
LOCK=threading.RLock()
class Store:
    def __init__(self):
        self.revision=0; self.song=core.demo_song()
        if (DATA/'autosave.json').exists(): self.song=core.validate(json.loads((DATA/'autosave.json').read_text(encoding='utf-8')))
    def get(self):
        with LOCK: return dict(song=core.validate(self.song),revision=self.revision)
    def put(self,song,revision):
        valid=core.validate(song)
        with LOCK:
            if revision!=self.revision: raise Conflict('他の画面またはAIによる更新があります。最新の楽曲を取得してください。')
            DATA.mkdir(parents=True,exist_ok=True)
            temp=DATA/'autosave.tmp'; temp.write_text(json.dumps(valid,ensure_ascii=False),encoding='utf-8'); temp.replace(DATA/'autosave.json')
            self.song=valid; self.revision+=1
            return self.get()
class Conflict(ValueError): pass

class Handler(BaseHTTPRequestHandler):
    def reply(self,data,status=200,kind='application/json; charset=utf-8'):
        if not isinstance(data,bytes): data=json.dumps(data,ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers(); self.wfile.write(data)
    def allowed(self):
        hosts={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
        return self.headers.get('Host') in hosts and (not self.headers.get('Origin') or self.headers['Origin'] in {'http://'+h for h in hosts})
    def do_GET(self):
        if not self.allowed(): return self.reply(dict(error='Local access only'),403)
        route=urlparse(self.path).path
        if route=='/api/state': return self.reply(self.server.store.get())
        if route=='/api/info': return self.reply(dict(app='msx-music-studio',version='0.5.0',token=self.server.token,patches=core.PATCH_NAMES))
        if route=='/api/new': return self.reply(core.new_song())
        if route=='/api/demo': return self.reply(core.demo_song())
        allowed={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
        if route not in allowed: return self.reply(dict(error='Not found'),404)
        path=core.ROOT/'static'/allowed[route]
        self.reply(path.read_bytes(),kind=mimetypes.guess_type(str(path))[0]+'; charset=utf-8')
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4_000_000: raise ValueError('要求データが大きすぎます。')
            self.connection.settimeout(10)
            raw=self.rfile.read(size)
            if not self.allowed() or not secrets.compare_digest(self.headers.get('X-Studio-Token',''),self.server.token):
                return self.reply(dict(error='ローカル接続トークンを確認してください。'),403)
            body=json.loads(raw); route=urlparse(self.path).path
            if route=='/api/state': return self.reply(self.server.store.put(body['song'],body['revision']))
            if route=='/api/mml': return self.reply(import_mml(body['text']))
            if route=='/api/validate': return self.reply(core.compile_song(body['song']))
            if route=='/api/render': return self.reply(core.render(body['song']),kind='audio/wav')
            if route=='/api/export':
                p=core.validate(body['song']); fmt=body['format']
                if fmt=='json': result=json.dumps(p,ensure_ascii=False,indent=2).encode(); kind='application/json'
                elif fmt=='registers': result=json.dumps(core.compile_song(p),indent=2).encode(); kind='application/json'
                elif fmt=='header': result=core.header(p).encode(); kind='text/plain'
                elif fmt=='vgm': result=core.vgm(p); kind='application/octet-stream'
                elif fmt=='mgs': result=export_mgs(p); kind='application/octet-stream'
                elif fmt=='bundle': result=core.bundle(p); kind='application/zip'
                elif fmt=='wav': result=core.render(p); kind='audio/wav'
                else: raise ValueError('未対応の出力形式です。')
                return self.reply(result,kind=kind)
            return self.reply(dict(error='Not found'),404)
        except Conflict as e: self.reply(dict(error=str(e)),409)
        except (ValueError,TypeError,KeyError) as e: self.reply(dict(error=str(e)),400)
        except Exception as e:
            print(f'Error: {e}',flush=True); self.reply(dict(error='処理に失敗しました。サーバーログを確認してください。'),500)
    def log_message(self,fmt,*args): pass

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=7913); parser.add_argument('--no-browser',action='store_true'); args=parser.parse_args()
    url=f'http://127.0.0.1:{args.port}'
    try: server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError:
        from urllib.request import urlopen
        try:
            with urlopen(url+'/api/info',timeout=2) as r: info=json.load(r)
            if info.get('app')!='msx-music-studio': raise ValueError('Port is in use by another app')
        except Exception as e: raise RuntimeError(f'Port {args.port} is unavailable. Select another --port.') from e
        if not args.no_browser: webbrowser.open(url)
        print(f'Already running: {url}',flush=True); return
    server.store=Store(); server.token=secrets.token_urlsafe(32)
    server.daemon_threads=True
    print(f'Editor: {url}',flush=True)
    if not args.no_browser: threading.Timer(.5,lambda:webbrowser.open(url)).start()
    server.serve_forever()
if __name__=='__main__': main()
