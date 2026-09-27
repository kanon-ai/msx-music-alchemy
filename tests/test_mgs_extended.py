"""Native MGS decoding checks, independent of the bytecode writer."""
import copy
import struct
import unittest

import core
import mgs
from mgs_extended import compact_song, timing_grid


def decode_track(blob, track, passes=1):
    base=blob.index(b'\x1a')+1
    pos=base+struct.unpack_from('<H',blob,base+6+track*2)[0]
    clock=0;default=48;octave=3;volume=0;patch=0;stack=[];events=[];commands=[]
    rhythm=bool(blob[base+1]&1) and track==14
    for _ in range(200000):
        op=blob[pos];pos+=1
        if op==255:return events,clock,commands
        if (rhythm and 0x20<=op<=0x3f) or (not rhythm and 0x20<=op<=0x2c):
            code=op-0x20;duration=blob[pos] or 256;pos+=1
        elif (rhythm and 0xa0<=op<=0xbf) or (not rhythm and 0x30<=op<=0x3c):
            code=op-(0xa0 if rhythm else 0x30);duration=default
        else:
            if op==0x42:default=blob[pos] or 256;pos+=1
            elif 0x80<=op<=0x9f:patch=op-0x80
            elif 0xc0<=op<=0xcf:volume=op&15
            elif 0xd0<=op<=0xd7:octave=op&7
            elif op in (0x45,0x50,0x53,0x5a):commands.append((clock,op,blob[pos]));pos+=1
            elif op==0x54:commands.append((clock,op,tuple(blob[pos:pos+4])));pos+=4
            elif op==0x40:commands.append((clock,op,None))
            elif op==0x57:stack.append([blob[pos] or passes,pos+3]);pos+=3
            elif op==0x59:
                pos+=3;stack[-1][0]-=1
                if stack[-1][0]:pos=stack[-1][1]
                else:stack.pop()
            else:raise AssertionError(hex(op))
            continue
        events.append((clock,duration,code,octave,volume,patch));clock+=duration
    raise AssertionError('unbounded decode')


class ExtendedMGS(unittest.TestCase):
    def song(self):
        p=core.new_song();p.update(loop=False,bpm=79,bars=4,opllRhythm=True)
        return p

    def test_patch_override_restores_and_all_tracks_end(self):
        p=self.song();t=p['tracks'][3];t['instrument']=1
        t['notes']=[dict(id='a',pitch=60,start=0,duration=24,velocity=8,instrument=12),
                    dict(id='b',pitch=64,start=48,duration=24,velocity=6)]
        before=copy.deepcopy(p);blob=mgs.export_mgs(p)
        self.assertEqual(p,before)
        notes=[e for e in decode_track(blob,8)[0] if e[2]!=12]
        self.assertEqual([(e[0],e[2],e[4],e[5]) for e in notes],[(0,0,8,11),(48,4,6,0)])
        for tr in range(15):self.assertEqual(decode_track(blob,tr)[1],1536)

    def test_long_rhythm_gap_does_not_retrigger(self):
        p=self.song();p['tracks'][9]['notes']=[dict(id='hit',pitch=36,start=0,duration=9,velocity=12)]
        events,end,commands=decode_track(mgs.export_mgs(p),14)
        self.assertEqual(sum(e[2]!=0 for e in events),1)
        self.assertEqual(events[0][2],16)
        self.assertIn((0,0x45,12),commands)
        self.assertEqual(end,1536)

    def test_loop_restores_expression_state(self):
        p=self.song();p.update(loop=True,loopStart=96)
        p['tracks'][3]['notes']=[dict(id='a',pitch=60,start=96,duration=48,velocity=8),
            dict(id='b',pitch=64,start=384,duration=96,velocity=5,detuneCents=30,
                 vibratoDepth=20,vibratoDelayMs=100)]
        events,end,commands=decode_track(mgs.export_mgs(p),8,2)
        self.assertEqual(end,1536*2-96)
        for tick in (96,1536):
            self.assertIn((tick,0x50,0),commands)
            self.assertIn((tick,0x5a,0),commands)
        self.assertEqual(sum(e[2]!=12 for e in events),4)

    def test_grid_never_emits_zero_frame_tail(self):
        for bpm in (40,79,120,177,300):
            p=self.song();p['bpm']=bpm
            compact,end=compact_song(p);grid=timing_grid(p)
            blob=mgs.export_mgs(p)
            for tr in range(15):
                events,total,_=decode_track(blob,tr)
                self.assertEqual(total,end)
                self.assertTrue(all(e[1]>=grid and e[1]%grid==0 for e in events))

    def test_native_vibrato_and_glide_present(self):
        p=self.song();p['tracks'][3]['notes']=[dict(id='a',pitch=64,start=0,duration=384,
            velocity=8,portamentoFrom=48,portamentoMs=80,vibratoDepth=18,vibratoRate=46,vibratoDelayMs=300)]
        _,_,commands=decode_track(mgs.export_mgs(p),8)
        self.assertTrue(any(c[1]==0x53 and c[2]==0 for c in commands))
        self.assertTrue(any(c[1]==0x54 for c in commands))
        self.assertTrue(any(c[1]==0x40 for c in commands))

    def test_tiny_note_fails_instead_of_disappearing(self):
        p=self.song();p['tracks'][0]['notes']=[dict(id='a',pitch=60,start=3,duration=1,velocity=8)]
        with self.assertRaises(ValueError):mgs.export_mgs(p)


if __name__=='__main__':unittest.main()
