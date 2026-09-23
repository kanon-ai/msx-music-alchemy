import sys
from pathlib import Path
import os
if getattr(sys,'frozen',False):
    os.environ.setdefault('MSX_MUSIC_DATA',str(Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'MSXMusicAlchemy'/'data'))
import server
if __name__=='__main__':
    if '--mcp' in sys.argv:
        sys.argv.remove('--mcp')
        import mcp_server
        mcp_server.main()
    else:
        server.main()
