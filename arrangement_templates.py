"""Non-destructive arrangement recipes using ordinary song notes."""
import copy
import core

PRESETS = {
    'soft_echo': dict(delayMs=180, attenuation=4, minimumDurationMs=0),
    'long_note_echo': dict(delayMs=320, attenuation=6, minimumDurationMs=180),
}

def apply_template(song, preset, source_id, target_id):
    if preset not in PRESETS:
        raise ValueError('Unknown arrangement template')
    p = core.validate(song)
    source = next((t for t in p['tracks'] if t['id'] == source_id), None)
    target = next((t for t in p['tracks'] if t['id'] == target_id), None)
    if source is None or target is None or source_id == target_id:
        raise ValueError('Choose distinct existing source and target tracks')
    if target['notes']:
        raise ValueError('Echo target must be empty; existing notes are never overwritten')
    if source['chip'] != 'OPLL' or target['chip'] != 'OPLL':
        raise ValueError('These recipes require OPLL source and target tracks')
    if source['mute']:
        raise ValueError('Choose an audible source track')
    if p.get('opllRhythm'):
        drums = [t for t in p['tracks'] if t['chip'] == 'OPLL' and t['channel'] >= 6]
        if source['channel'] >= 6:
            raise ValueError('Cannot echo rhythm as a melodic voice')
        if target['channel'] >= 6:
            if any(t['notes'] for t in drums):
                raise ValueError('Rhythm channels are occupied; choose a free melodic channel')
            p['opllRhythm'] = False
    recipe = PRESETS[preset]
    ticks_per_ms = p['bpm'] * p['ppq'] / 60000
    delay = max(1, round(recipe['delayMs'] * ticks_per_ms))
    minimum = round(recipe['minimumDurationMs'] * ticks_per_ms)
    target.update(name=(source['name'][:50] + ' / ' + preset)[:80],
                  instrument=source['instrument'], mute=False)
    end = p['bars'] * 384
    skipped = 0
    for n in source['notes']:
        velocity = n['velocity'] - recipe['attenuation']
        start = n['start'] + delay
        duration = min(n['duration'], end - start)
        # Do not clamp a quiet echo to v1: that would make it disproportionately loud.
        if n['duration'] < minimum or velocity < 1 or duration < 3:
            skipped += 1
            continue
        target['notes'].append(dict(n, id='echo-' + n['id'], start=start,
                                    duration=duration, velocity=velocity))
    if not target['notes']:
        raise ValueError('No eligible echo notes; choose a louder or longer source')
    result = core.compile_song(p)
    if result['warnings']:
        raise ValueError(str(result['warnings']))
    return dict(song=p, report=dict(preset=preset, source=source_id, target=target_id,
                                   copied=len(target['notes']), skipped=skipped,
                                   delayTicks=delay, delayMs=delay/ticks_per_ms,
                                   rhythmDisabled=bool(song.get('opllRhythm')) and not p.get('opllRhythm')))
