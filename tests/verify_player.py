"""Compile actual C header scheduler, compare its callbacks to the Python compiler."""
import pathlib
import subprocess
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import core
root=core.ROOT/'test-results/player';root.mkdir(parents=True,exist_ok=True)
p=core.demo_song();p['loopStart']=384
data=core.compile_song(p);limit=data['frames']+(data['frames']-data['loopFrame'])*2+1
(root/'song.h').write_text(core.header(p))
(root/'msx_player.h').write_bytes((core.ROOT/'docs/msx_player.h').read_bytes())
(root/'main.c').write_bytes((core.ROOT/'tests/player_harness.c').read_bytes())
(root/'CMakeLists.txt').write_text('cmake_minimum_required(VERSION 3.20)\nproject(player_check C)\nadd_executable(player_check main.c)\ntarget_compile_definitions(player_check PRIVATE TEST_FRAME_LIMIT='+str(limit)+')\n')
subprocess.run(['cmake','-S',str(root),'-B',str(root/'build'),'-A','x64'],check=True)
subprocess.run(['cmake','--build',str(root/'build'),'--config','Release'],check=True)
raw=subprocess.check_output([str(root/'build/Release/player_check.exe')],text=True)
actual=[list(map(int,line.split(','))) for line in raw.splitlines()]
expected=[]
events={e['frame']:e['writes'] for e in data['events']}
for f,writes in events.items():expected.extend([[f]+w for w in writes])
iteration_start=data['frames']
while iteration_start<limit:
    for f,writes in events.items():
        current=iteration_start+f-data['loopFrame']
        if f>=data['loopFrame'] and current<limit:expected.extend([[current]+w for w in writes])
    iteration_start+=data['frames']-data['loopFrame']
assert actual==expected, f'Scheduler mismatch: {len(actual)} vs {len(expected)} callbacks'
print('C89 player: exact callback/frame match over three loops,',len(actual),'writes')
