"""MCP stdio transport (newline-delimited JSON-RPC). No network AI dependency."""
import argparse
import json
from pathlib import Path
import sys
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import core
from mgs import export_mgs
from mml import import_mml

BASE='http://127.0.0.1:7913'
OUTPUT=(Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parent)/'outputs'
def http(path,body=None):
    headers={}
    if body is not None:
        headers={'Content-Type':'application/json','X-Studio-Token':http('/api/info')['token']}
    request=Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
    try:
        with urlopen(request,timeout=100) as r: return json.load(r)
    except HTTPError as e: raise ValueError(e.read().decode()) from e

def tool(name,description,props=None,required=None,read=False):
    return dict(name=name,description=description,inputSchema=dict(type='object',properties=props or {},required=required or [],additionalProperties=False),annotations=dict(readOnlyHint=read,destructiveHint=False,openWorldHint=False))
TOOLS=[
 tool('get_song','Get the editor song and revision before changing it. Server must be running.',read=True),
 tool('get_composition_guide','Read schema, timing, channel restrictions, and AI composition workflow.',read=True),
 tool('new_song','Return a blank 17-channel song; does not overwrite the editor.',{'title':{'type':'string'}},read=True),
 tool('set_song','Validate and replace the editor song using its expected revision. GUI updates automatically.',{'song':{'type':'object'},'revision':{'type':'integer'}},['song','revision']),
 tool('set_track_notes','Replace one track notes atomically; other tracks are preserved.',{'trackId':{'type':'string'},'notes':{'type':'array','items':{'type':'object'}},'revision':{'type':'integer'}},['trackId','notes','revision']),
 tool('import_mml','Parse MGSC melodic subset into editable JSON. Does not overwrite the editor.',{'text':{'type':'string'}},['text'],True),
 tool('validate_song','Validate a song including frame timing and hardware constraints.',{'song':{'type':'object'}},['song'],True),
 tool('export_song','Export the supplied song to outputs. MGS supports 60 Hz, 17 channels, up to 16 KiB. A new filename is required; never overwrites.',{'song':{'type':'object'},'format':{'type':'string','enum':['json','registers','header','vgm','mgs','wav','bundle']},'filename':{'type':'string'}},['song','format','filename'])
]

def call(name,args):
    if name=='get_song': return http('/api/state')
    if name=='get_composition_guide':
        return dict(guide=(core.ROOT/'docs/AI_COMPOSITION.md').read_text(encoding='utf-8'),schema=json.loads((core.ROOT/'docs/song.schema.json').read_text()))
    if name=='new_song': return core.new_song(args.get('title','Untitled signal'))
    if name=='set_song': return http('/api/state',dict(song=core.validate(args['song']),revision=args['revision']))
    if name=='set_track_notes':
        state=http('/api/state')
        if state['revision']!=args['revision']: raise ValueError('Revision conflict. Call get_song again.')
        t=next((t for t in state['song']['tracks'] if t['id']==args['trackId']),None)
        if t is None: raise ValueError('Unknown track ID')
        t['notes']=args['notes']; return http('/api/state',dict(song=core.validate(state['song']),revision=args['revision']))
    if name=='import_mml': return import_mml(args['text'])
    if name=='validate_song':
        d=core.compile_song(args['song']); return dict(valid=True,frames=d['frames'],hz=d['hz'],warnings=d['warnings'])
    if name=='export_song':
        p=core.validate(args['song']); fmt=args['format']; name=args['filename']
        import re
        if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,70}',name) or name.upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(10)],*[f'LPT{i}' for i in range(10)]}: raise ValueError('Use a plain alphanumeric filename without extension.')
        exporters={'json':(lambda:json.dumps(p,ensure_ascii=False,indent=2).encode(),'.msx.json'),'registers':(lambda:json.dumps(core.compile_song(p),indent=2).encode(),'.registers.json'),'header':(lambda:core.header(p).encode(),'.h'),'vgm':(lambda:core.vgm(p),'.vgm'),'mgs':(lambda:export_mgs(p),'.mgs'),'wav':(lambda:core.render(p),'.wav'),'bundle':(lambda:core.bundle(p),'.zip')}
        if fmt not in exporters: raise ValueError('Unknown format')
        fn,ext=exporters[fmt]; data=fn(); OUTPUT.mkdir(parents=True,exist_ok=True); target=OUTPUT/(name+ext)
        with target.open('xb') as f: f.write(data)
        return dict(path=str(target),bytes=len(data))
    raise ValueError('Unknown tool')

def handle(req):
    if not isinstance(req,dict) or req.get('jsonrpc')!='2.0': return dict(jsonrpc='2.0',id=None,error=dict(code=-32600,message='Invalid Request'))
    if 'id' not in req: return None
    id_=req['id']; method=req.get('method'); params=req.get('params',{})
    result=None
    if method=='initialize':
        version=params.get('protocolVersion'); supported=['2024-11-05','2025-03-26','2025-06-18','2025-11-25']
        result=dict(protocolVersion=version if version in supported else supported[-1],capabilities=dict(tools=dict(listChanged=False)),serverInfo=dict(name='msx-music-alchemy',version='0.3.2'))
    elif method=='ping': result={}
    elif method=='tools/list': result=dict(tools=TOOLS)
    elif method=='tools/call':
        try:
            name=params['name']; args=params.get('arguments',{})
            spec=next((t for t in TOOLS if t['name']==name),None)
            if spec is None or not isinstance(args,dict): raise ValueError('Unknown tool or invalid arguments')
            if set(args)-set(spec['inputSchema']['properties']) or set(spec['inputSchema']['required'])-set(args): raise ValueError('Invalid arguments')
            value=call(name,args); result=dict(content=[dict(type='text',text=json.dumps(value,ensure_ascii=False))],isError=False)
        except Exception as e: result=dict(content=[dict(type='text',text=str(e))],isError=True)
    else: return dict(jsonrpc='2.0',id=id_,error=dict(code=-32601,message='Method not found'))
    return dict(jsonrpc='2.0',id=id_,result=result)

def main():
    global BASE
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=7913); args=parser.parse_args(); BASE=f'http://127.0.0.1:{args.port}'
    for line in sys.stdin.buffer:
        try: result=handle(json.loads(line))
        except Exception: result=dict(jsonrpc='2.0',id=None,error=dict(code=-32700,message='Parse error'))
        if result is not None:
            sys.stdout.buffer.write((json.dumps(result,ensure_ascii=False)+'\n').encode()); sys.stdout.buffer.flush()
if __name__=='__main__': main()
