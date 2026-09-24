"""Audio regressions for the audible bass/piano clicks at Sicilienne bar 19."""
import copy
import io
import json
import math
from pathlib import Path
import sys
import unittest
import wave
import array

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import core


class OpllAttackTests(unittest.TestCase):
    def test_touching_guitar_notes_retrigger_without_frame_gap(self):
        song = core.new_song()
        song.update(bpm=120, bars=2, loop=False)
        song['tracks'][3]['instrument'] = 2
        song['tracks'][3]['notes'] = [dict(id=str(i), pitch=72, start=i*48,
                                         duration=48, velocity=12) for i in range(12)]
        with wave.open(io.BytesIO(core.render(song))) as wav:
            pcm = array.array('h', wav.readframes(wav.getnframes()))
            if sys.byteorder != 'little':
                pcm.byteswap()
        rms = [math.sqrt(sum(x*x for x in pcm[i*11025:i*11025+2205])/2205)
               for i in range(12)]
        self.assertGreater(rms[0], 100)
        self.assertGreater(min(rms[1:]), rms[0]*0.7)
        self.assertLess(max(rms[1:]), rms[0]*1.3)

    def test_bass_and_piano_do_not_have_abrupt_attack_spikes(self):
        source = json.loads((core.ROOT / 'samples/sicilienne-cantabile/song.msx.json').read_text())
        for channels in ([4], list(range(5, 11))):
            with self.subTest(channels=channels):
                song = copy.deepcopy(source)
                song['bars'] = 2
                # Include a full bar of preceding notes, retaining release/retrigger history.
                start, end = 6528, 7296
                for i, track in enumerate(song['tracks']):
                    track['mute'] = i not in channels
                    notes = []
                    for note in track['notes']:
                        a, b = max(start, note['start']), min(end, note['start'] + note['duration'])
                        if b - a >= 3:
                            notes.append(dict(note, start=a-start, duration=b-a))
                    track['notes'] = notes
                with wave.open(io.BytesIO(core.render(song))) as wav:
                    self.assertEqual(wav.getframerate(), 44100)
                    pcm = array.array('h', wav.readframes(wav.getnframes()))
                    if sys.byteorder != 'little':
                        pcm.byteswap()
                region = pcm[211680:423360]
                rms = math.sqrt(sum(x*x for x in region) / len(region))
                self.assertGreater(rms, 10, 'Muting the voice must not pass this check')
                maximum_step = max(abs(b-a) for a, b in zip(region, region[1:]))
                # The user-confirmed ymfm comparison is below 0.9; old emu2413
                # bass/piano ratios were 1.90/2.96. This is not a universal audio metric.
                self.assertLess(maximum_step / rms, 0.9)


if __name__ == '__main__':
    unittest.main()
