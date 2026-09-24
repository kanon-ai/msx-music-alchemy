"""Rebuild the CC0 score events as a chip arrangement; does not change the editor."""
import collections
import json
import math
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
import core


def build():
    events = json.loads((HERE / 'source-events.json').read_text())
    song = core.new_song('Faure - Sicilienne | Cantabile - public score edition')
    song.update(bpm=50, bars=45, hz=60, loop=False, loopStart=0)
    # Faster carrier attack makes the written short notes speak clearly.
    song['opllPatch'] = [0x11, 0x61, 0x10, 0x07, 0x8d, 0xa4, 0x70, 0x27]
    names = ['PSG soft inner voice I', 'PSG soft inner voice II', 'PSG soft inner voice III',
             'FM cantabile flute', 'FM acoustic bass', 'FM soft vibraphone',
             'FM piano I', 'FM piano II', 'FM piano III', 'FM piano IV',
             'FM piano V', 'FM flute echo -6dB', 'SCC faint flute breath',
             'SCC unused', 'SCC unused', 'SCC unused', 'SCC unused']
    for i, t in enumerate(song['tracks']):
        t.update(name=names[i], notes=[], mute=i >= 13,
                 instrument=14 if i == 4 else 12 if i == 5 else 3 if 6 <= i <= 10 else 0)
        if i >= 12:
            t['wave'] = [round(60 * math.sin(math.tau * j / 32)) for j in range(32)]
    timeline = [0.0]
    cadences = {8, 16, 24, 32, 40, 43, 52, 60, 68, 76, 80, 85, 86}
    for tick in range(86 * 192 + 1):
        bar, phase = tick // 192 + 1, tick % 192 / 192
        rate = .975 if 26 <= bar <= 32 or 62 <= bar <= 67 else 1.035 if 44 <= bar <= 60 else 1.02
        if bar in cadences:
            rate += .16 * phase ** 2
        if bar >= 81:
            rate += .025 * (bar - 80)
        if bar == 86:
            rate += .24 * phase
        timeline.append(timeline[-1] + rate + .015 * math.cos(tick % 96 / 96 * math.tau))

    def tm(tick):
        return round(timeline[min(len(timeline) - 1, max(0, round(tick)))])

    def free(i, start, duration):
        return all(start + duration <= n['start'] or start >= n['start'] + n['duration']
                   for n in song['tracks'][i]['notes'])

    def put(i, pitch, start, duration, volume):
        assert duration >= 3 and free(i, start, duration), (i, pitch, start, duration)
        notes = song['tracks'][i]['notes']
        notes.append(dict(id=f'c{i}-{len(notes)}', pitch=pitch, start=start,
                          duration=duration, velocity=max(1, min(15, round(volume)))))

    def strength(e):
        arc = 1.2 * math.sin(math.pi * (e['start'] % 1536) / 1536)
        swell = .8 if 26 <= e['measure'] <= 33 or 58 <= e['measure'] <= 68 else 0
        fade = .20 * max(0, e['measure'] - 77)
        return arc + swell - fade + .18 * (e['velocity'] - 7)

    melody = sorted((e for e in events if e['part'] == 'P1'), key=lambda e: e['start'])
    coverage = collections.Counter()
    for j, e in enumerate(melody):
        start, end = tm(e['start']), tm(e['start'] + e['duration'])
        phrase_end = j == len(melody) - 1 or melody[j + 1]['start'] > e['start'] + e['duration'] + 8
        duration = end - start - (min(7, (end - start) // 10) if phrase_end else 1)
        put(3, e['pitch'], start, duration, 11 + strength(e))
        put(11, e['pitch'], start + 24, duration, round(11 + strength(e)) - 2)
        coverage['melody'] += 1
        # Only broad notes receive a very quiet fundamental; never an SCC accompaniment.
        if duration >= 72 and 8 < e['measure'] < 81:
            s, d = start + 6, duration - 14
            bounds = [s, s + d // 4, s + 3 * d // 4, s + d]
            for a, b, v in zip(bounds, bounds[1:], [1, 2, 1]):
                put(12, e['pitch'], a, b - a, v)

    piano = sorted((e for e in events if e['part'] == 'P2'), key=lambda e: (e['start'], e['pitch']))
    for e in piano:
        start = tm(e['start'])
        duration = max(3, tm(e['start'] + e['duration']) - start - 2)
        # Seven FM voices cover most of the piano; PSG catches the rare dense chords.
        pool = ([4] if e['pitch'] < 55 else []) + list(range(6, 11)) + [5]
        available = [i for i in pool if free(i, start, duration)]
        if not available:
            available = [i for i in [0, 1, 2] if free(i, start, duration)]
        assert available, ('polyphony', e)
        i = available[0]
        v = (9 if i == 4 else 7 if i == 5 else 8) + strength(e)
        if i < 3:
            v = 2 if e['pitch'] >= 76 else 3
        elif e['pitch'] >= 76:
            v -= 1
        put(i, e['pitch'], start, duration, v)
        coverage['piano'] += 1

    # Quiet, middle-register chord colour. Leave opening/coda and short chords bare.
    for e in piano:
        if e['staff'] != '1' or e['duration'] < 64 or not 8 < e['measure'] < 77:
            continue
        pitch = e['pitch']
        while pitch > 67:
            pitch -= 12
        start = tm(e['start']) + 5
        duration = tm(e['start'] + e['duration']) - start - 7
        for i in [0, 1, 2]:
            if free(i, start, duration):
                put(i, pitch, start, duration, 2)
                coverage['chorus'] += 1
                break
    for t in song['tracks']:
        t['notes'].sort(key=lambda n: n['start'])
    core.validate(song)
    compiled = core.compile_song(song)
    assert not compiled['warnings'], compiled['warnings']
    assert coverage['melody'] == 300 and coverage['piano'] == 1070
    return song, dict(coverage)


if __name__ == '__main__':
    song, coverage = build()
    (HERE / 'song.msx.json').write_text(json.dumps(song, ensure_ascii=False, indent=2), encoding='utf-8')
    print(coverage)
