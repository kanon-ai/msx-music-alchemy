# Chiptune arrangement templates

MCP `get_arrangement_templates` lists recipes. `preview_arrangement_template` accepts a song, preset, sourceId and targetId and returns a modified copy plus a report. It does not change the editor. Read the current revision, inspect/validate the returned song, then use `set_song` with that revision. Preserve the input song as a separate save.

- `soft_echo`: 180 ms delay, minus 4 OPLL volume steps (approximately -12 dB).
- `long_note_echo`: 320 ms delay, minus 6 steps (approximately -18 dB), only notes at least 180 ms long.

Use separate empty OPLL channels; source notes, timing, patches and volumes are preserved. Echo instrument matches the source. Notes too quiet for the attenuation are omitted rather than raised to the minimum volume. Tails are clipped at the song end, not wrapped around the loop. The report gives the actual rounded delay and skipped count. Applying twice to an occupied target fails rather than stacking effects. Empty rhythm lanes can be reclaimed only when all three drum tracks contain no notes; the report explicitly says rhythm was disabled. Existing drums are never overwritten.

## Dreamlike chamber recipe

Choose one prominent sustained line for `soft_echo`, and optionally one quieter upper line for a second echo. Start with one or two extra voices, not echoes on every accompaniment. For a sparse keyboard use `long_note_echo` only when its velocity is high enough. This uses actual chip channels; there is no stereo reverb effect or new audio synthesizer.

The current ymfm YM2413 ROM flute preset already enables carrier hardware vibrato (bit 6 of its second patch byte). It is not newly added by the echo recipe. Adjustable vibrato rate/depth, delayed vibrato and per-note pitch envelopes are NOT supported by the current song schema. Do not imitate subtle vibrato by alternating semitone MIDI notes: that changes the tune. A future explicit pitch-effect schema/compiler extension requires separate work and regression coverage.

## Validation and limitations

Use the same-frame OPLL retrigger fix in the local native renderer for adjoining notes. JSON/VGM contain the echoed notes; emulators and physical MSX playback may sound different. No physical hardware verification. These templates make no claim that more voices always improve an arrangement.
