import copy
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import core
import mgs
import mcp_server


def decode(blob):
    base = blob.index(b'\x1a') + 1
    offsets = struct.unpack_from('<18H', blob, base + 4)
    result = []
    for track, offset in enumerate(offsets[1:]):
        pos = base + offset; clock = 0; octave = volume = 0; notes = []; marker = None
        while True:
            cmd = blob[pos]; pos += 1
            if cmd == 255:
                break
            if cmd <= 12:
                duration = 0
                while True:
                    v = blob[pos]; pos += 1; duration += v
                    if v != 255: break
                if cmd < 12:
                    pitch = 12 * (octave + 2 - (track >= 8)) + cmd
                    notes.append((clock, clock + duration, pitch, volume))
                clock += duration
            elif 0xd0 <= cmd <= 0xd7: octave = cmd & 7
            elif 0xc0 <= cmd <= 0xcf: volume = cmd & 15
            elif 0x80 <= cmd <= 0x9f: pass
            elif cmd == 0x44: pos += 1
            elif cmd == 0x40: pass
            elif cmd == 0x57: marker = clock; pos += 3
            elif cmd == 0x59: pos += 3
            else: raise AssertionError(hex(cmd))
        result.append((notes, clock, marker))
    return result


class MGSTests(unittest.TestCase):
    def test_frame_pitch_volume_channel_mapping_and_immutability(self):
        p = core.new_song('日本語\r\n\x1a title');p.update(bpm=97,bars=8,loop=False)
        for i,t in enumerate(p['tracks']):
            t['notes']=[dict(id='a',pitch=24+i*4,start=17+i,duration=1001,velocity=1+i%15)]
        old=copy.deepcopy(p); blob=mgs.export_mgs(p);self.assertEqual(p,old)
        self.assertTrue(blob.startswith(b'MGS303\r\n'))
        self.assertEqual(blob[8:blob.index(b'\x1a')].count(b'\r\n'),1)
        for (chip,ch),(notes,end,marker) in zip(mgs.ORDER,decode(blob)):
            t=next(t for t in p['tracks'] if (t['chip'],t['channel'])==(chip,ch));n=t['notes'][0]
            f=lambda tick:round(tick*3600/(97*96))
            self.assertEqual(notes,[(f(n['start']),f(n['start']+n['duration']),n['pitch'],n['velocity'])])
            self.assertEqual(end,f(8*384));self.assertIsNone(marker)
        base=blob.index(b'\x1a')+1;voice=base+40
        self.assertEqual(blob[voice:voice+10],bytes([0,15,*p['opllPatch']]))
        for i in range(5):
            off=voice+10+i*34;self.assertEqual(blob[off:off+34],bytes([3,i,*[v&255 for v in p['tracks'][12+i]['wave']]]))

    def test_loop_inside_note_and_silent_channels(self):
        p=core.new_song();p.update(bpm=120,bars=2,loop=True,loopStart=96)
        p['tracks'][0]['notes']=[dict(id='a',pitch=60,start=0,duration=192,velocity=10)]
        rows=decode(mgs.export_mgs(p));self.assertEqual(rows[0][0],[(0,30,60,10),(30,60,60,10)])
        self.assertTrue(all(end==240 and marker==30 for notes,end,marker in rows))
        p['tracks'][0]['mute']=True;self.assertEqual(decode(mgs.export_mgs(p))[0][0],[])

    def test_reject_50hz_short_notes_and_oversize(self):
        p=core.new_song();p['hz']=50
        with self.assertRaisesRegex(ValueError,'60 Hz'):mgs.export_mgs(p)
        p['hz']=60;p['tracks'][0]['notes']=[dict(id='a',pitch=60,start=0,duration=1,velocity=10)]
        with self.assertRaises(ValueError):mgs.export_mgs(p)
        p.update(bars=64,bpm=300,loop=False)
        for t in p['tracks']:
            t['notes']=[dict(id=str(i),pitch=48+i%36,start=i*20,duration=10,velocity=1+i%15) for i in range(900)]
        with self.assertRaisesRegex(ValueError,'16 KiB'):mgs.export_mgs(p)

    def test_mcp_export_does_not_overwrite(self):
        p=core.demo_song();old=mcp_server.OUTPUT
        try:
            with tempfile.TemporaryDirectory() as d:
                mcp_server.OUTPUT=Path(d)
                r=mcp_server.call('export_song',dict(song=p,format='mgs',filename='test'))
                self.assertEqual(Path(r['path']).read_bytes(),mgs.export_mgs(p))
                with self.assertRaises(FileExistsError):mcp_server.call('export_song',dict(song=p,format='mgs',filename='test'))
        finally:mcp_server.OUTPUT=old


if __name__=='__main__':unittest.main()
