import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import core
import opll_kit

def song():
    s=core.new_song();s.update(loop=False,bars=1,hz=60)
    t=next(t for t in s['tracks'] if t['chip']=='OPLL')
    t['notes']=[dict(id='a',pitch=60,start=0,duration=96,velocity=12,
                     vibratoDepth=8,vibratoRate=5,vibratoDelayMs=260)]
    return s

class KitTests(unittest.TestCase):
    def test_export_preserves_input_and_packages_bank(self):
        s=song();before=copy.deepcopy(s)
        with zipfile.ZipFile(io.BytesIO(opll_kit.export_kit(s))) as z:
            self.assertEqual(json.loads(z.read('song.msx.json')),before)
            bank=z.read('music-bank.bin');data=z.read('song.opz')
            self.assertEqual(len(bank),16384)
            self.assertEqual(bank[:len(data)],data)
            self.assertEqual(bank[15872:16173],z.read('player.bin'))
            for n,h in json.loads(z.read('SHA256.json')).items():
                self.assertEqual(hashlib.sha256(z.read(n)).hexdigest(),h)
            self.assertTrue(json.loads(z.read('manifest.json'))['software_vibrato_omitted'])
        self.assertEqual(s,before)

    def test_unsupported_conditions(self):
        s=song();s['hz']=50
        with self.assertRaisesRegex(ValueError,'60 Hz'):opll_kit.export_kit(s)
        s=song();s['loop']=True
        with self.assertRaisesRegex(ValueError,'ループ範囲'):opll_kit.export_kit(s)
        s=song();s['tracks'][0]['notes']=[dict(id='p',pitch=60,start=0,duration=96,velocity=10)]
        with self.assertRaisesRegex(ValueError,'OPLL専用'):opll_kit.export_kit(s)
        s['tracks'][0]['mute']=True
        opll_kit.export_kit(s)

    def test_oversize_has_user_facing_error(self):
        events=[dict(frame=i,writes=[[1,0x10,(i*73)%256],[1,0x11,(i*31)%256]]) for i in range(10000)]
        compiled=dict(events=events,frames=10000,hz=60,loop=False)
        # Disable compression to exercise the size guard before 16-bit offsets pack.
        with patch.object(core,'compile_song',return_value=compiled),patch.object(opll_kit,'compress',side_effect=lambda seq,terminals:(seq,{},{})):
            with self.assertRaisesRegex(ValueError,'上限15,872'):opll_kit.encode(song())

if __name__=='__main__':unittest.main()
