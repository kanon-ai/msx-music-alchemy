"""Load, validate and export the public-domain-based sample via actual MCP stdio."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--load', action='store_true', help='Back up and replace the running editor song')
    parser.add_argument('--wav', action='store_true')
    parser.add_argument('--port', type=int, default=7913)
    parser.add_argument('--exe', type=Path, help='Packaged MSXMusicAlchemy.exe')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    song = json.loads(Path(__file__).with_name('song.msx.json').read_text(encoding='utf-8'))
    command = [str(args.exe.resolve()), '--mcp'] if args.exe else [sys.executable, str(root / 'mcp_server.py')]
    command += ['--port', str(args.port)]
    sequence = 0
    with subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          text=True, encoding='utf-8', cwd=root) as process:
        def rpc(method, params):
            nonlocal sequence
            sequence += 1
            request = dict(jsonrpc='2.0', id=sequence, method=method, params=params)
            process.stdin.write(json.dumps(request) + '\n')
            process.stdin.flush()
            reply = json.loads(process.stdout.readline())
            if reply.get('id') != sequence or 'error' in reply:
                raise RuntimeError(reply)
            return reply['result']

        def call(name, **arguments):
            result = rpc('tools/call', dict(name=name, arguments=arguments))
            if result.get('isError'):
                raise RuntimeError(result['content'][0]['text'])
            return json.loads(result['content'][0]['text'])

        try:
            print(rpc('initialize', dict(protocolVersion='2025-11-25', capabilities={},
                                        clientInfo=dict(name='sicilienne-example', version='1.0'))))
            process.stdin.write(json.dumps(dict(jsonrpc='2.0', method='notifications/initialized')) + '\n')
            process.stdin.flush()
            print(call('validate_song', song=song))
            stamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            if args.load:
                state = call('get_song')
                print('Backup:', call('export_song', song=state['song'], format='json', filename='before_sample_' + stamp))
                loaded = call('set_song', song=song, revision=state['revision'])
                print('Loaded revision:', loaded['revision'])
            for fmt in ['json', 'vgm'] + (['wav'] if args.wav else []):
                print(call('export_song', song=song, format=fmt, filename='sicilienne_cantabile_' + stamp))
        finally:
            process.stdin.close()
            process.wait(timeout=10)


if __name__ == '__main__':
    main()
