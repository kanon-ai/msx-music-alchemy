"""MGSDRV v3 exporter using its frame-duration (MGS303) instruction set.

No compiler/driver binary is bundled. Format reference:
https://github.com/digital-sound-antiques/mgsc/blob/master/mgs-format.md
"""
import struct
import core

ORDER = [('PSG', i) for i in range(3)] + [('SCC', i) for i in range(5)] + [('OPLL', i) for i in range(9)]
MAX_DATA = 0x4000


def export_mgs(song):
    p = core.validate(song)
    if p.get('opllRhythm'):
        raise ValueError('OPLLリズム曲のMGS出力は未対応です。VGM、WAV、レジスタJSONをご利用ください。')
    if p['hz'] != 60:
        raise ValueError('MGSDRV出力は60 Hz専用です。更新周波数を60 Hzにして出力してください。')
    # Reuse the native compiler's frame-boundary validation, including short notes.
    core.compile_song(p)
    frame = lambda tick: (tick * 3600 + p['bpm'] * 48) // (p['bpm'] * 96)
    end = frame(p['bars'] * 384)
    loop = frame(p['loopStart']) if p['loop'] else None
    tracks = {(t['chip'], t['channel']): t for t in p['tracks']}
    # MGSC patch numbers 0..14 select OPLL ROM voices 1..15. Define custom at 15.
    voice = bytearray([0, 15, *p['opllPatch']])
    for ch in range(5):
        voice.extend([3, ch, *(v & 255 for v in tracks['SCC', ch]['wave'])])
    voice.append(255)
    blocks = [bytes(voice)]
    for chip, channel in ORDER:
        t = tracks[chip, channel]
        data = bytearray([0x44, 8])  # q8: explicit note-off gaps carry the articulation.
        if chip == 'OPLL':
            data.append(0x80 + (t['instrument'] - 1 if t['instrument'] else 15))
        elif chip == 'SCC':
            data.append(0x80 + channel)
        cursor = 0
        octave = volume = None
        marked = False
        loop_body = None

        def emit(pitch, duration, velocity):
            nonlocal octave, volume
            if duration <= 0:
                return
            if pitch is None:
                data.append(0x0c)
            else:
                # MGSDRV's FM pitch table is one octave below its PSG/SCC table.
                octv = pitch // 12 - 2 + (chip == 'OPLL')
                if octv != octave:
                    data.append(0xd0 + octv); octave = octv
                if velocity != volume:
                    data.append(0xc0 + velocity); volume = velocity
                data.append(pitch % 12)
            while duration >= 255:
                data.append(255); duration -= 255
            data.append(duration)

        def segment(pitch, stop, velocity=0):
            nonlocal cursor, marked, octave, volume, loop_body
            if loop is not None and not marked and cursor <= loop < stop:
                if loop > cursor:
                    emit(pitch, loop - cursor, velocity)
                    if pitch is not None:
                        data.append(0x40)
                data.extend([0x57, 0, 0, 0])  # Infinite loop, not the $ playback marker.
                loop_body = len(data)
                marked = True
                octave = volume = None  # Re-establish state every time the loop is entered.
                cursor = loop
            emit(pitch, stop - cursor, velocity)
            cursor = stop

        if not t['mute']:
            for n in t['notes']:
                start, stop = frame(n['start']), frame(n['start'] + n['duration'])
                segment(None, start)
                segment(n['pitch'], stop, n['velocity'])
        segment(None, end)
        if loop_body is not None:
            body_length = len(data) - loop_body
            if body_length + 3 > 32767:
                raise ValueError('MGSDRVのループ区間が大きすぎます。音符数を減らしてください。')
            struct.pack_into('<H', data, loop_body - 2, body_length + 1)
            data.extend([0x59, 0])
            data.extend(struct.pack('<h', -(body_length + 3)))
        data.append(255)
        blocks.append(bytes(data))
    header = bytearray(40)
    total = len(header) + sum(map(len, blocks))
    if total > MAX_DATA:
        raise ValueError(f'MGSDRVの16 KiB容量を超えています（{total:,} bytes）。音符数を減らすか曲を分割してください。')
    offset = len(header)
    for i, block in enumerate(blocks):
        struct.pack_into('<H', header, 4 + 2 * i, offset)
        offset += len(block)
    # Prevent text/header control characters; preserve Japanese where CP932 allows it.
    title = ''.join(c if ord(c) >= 32 and ord(c) != 127 else ' ' for c in p['title'])
    encoded = bytearray()
    for ch in title:
        part = ch.encode('cp932', errors='replace')
        if len(encoded) + len(part) > 120:
            break
        encoded.extend(part)
    return b'MGS303\r\n' + bytes(encoded) + b'\r\n\x1a' + bytes(header) + b''.join(blocks)
