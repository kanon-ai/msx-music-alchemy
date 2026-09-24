# Game integration — version 1

This is an original register-stream format, not MGS or a general-purpose VGM driver.
This is an independent project. No BIOS or commercial music is included.

## Contents and timing

- `song.msx.json`: lossless editable source; schema in `song.schema.json`.
- `registers.json`: absolute frame events. Each write is `[chip, register, value]`.
- `song.bin`: sparse little-endian packets: uint16 deltaFrames, uint16 writeCount,
  then writeCount triples of uint8 chip, register, value. `ffff 0000` ends the stream.
- `song.h`: the same bytes and timing/loop constants for C89.
- `msx_player.h`: reference C89 scheduler with a hardware-write callback.
- `song.vgm`: VGM 1.71, including chip clocks and optional loop metadata.
- `manifest.json`: frame rate, duration and loop packet byte offset.

Delta frames are relative to the previous packet (first packet relative to frame 0).
Apply all frame-0 writes before the first wait. An event at frame F applies at F / Hz seconds.
Call the C player's tick once per frame; its first call executes frame 0. No timer is installed.
Use the selected 50 or 60 Hz; do not play 60 Hz data at 50 Hz. 60 here means exactly 60,
not the physical NTSC 59.94-ish refresh rate. The slight tempo difference must be accounted
for by the game's timing policy. Source is 96 ticks per quarter and 4/4 time.

At song end there is a silence packet, then the sentinel. When looping, jump to loopOffset
and execute that packet immediately, ignoring its delta. Later deltas apply normally.
A nonzero loop target contains a restored register snapshot. OPLL envelope phase restarts
for notes that cross the boundary; align loops to note boundaries for best results.

## Hardware writes

`chip=0`: PSG AY-3-8910-compatible, clock 1,789,773 Hz, registers 0–13.
Register select uses port A0h, data A1h. The game callback must merge register 7's lower
six sound bits with its own upper two I/O-direction bits; do not disturb joystick handling.
No register 14/15 writes are generated. SFX sharing requires channel arbitration in the game.

`chip=1`: YM2413 OPLL, clock 3,579,545 Hz, select port 7Ch, data port 7Dh.
The callback must respect address/data write delays for the actual CPU (Z80/R800/etc.).
Nine melodic channels by default. With optional `opllRhythm: true`, channels 6–8 (zero-based) become hardware percussion, leaving six melodic channels. See AI_COMPOSITION.md for the drum keys. Register streams and VGM retain rhythm writes. Instrument 0 is one globally shared eight-byte patch.

`chip=2`: standard SCC (K051649), clock 3,579,545 Hz. Register is an offset from 9800h:
00–7F wave RAM, 80–89 periods, 8A–8E volumes, 8F channel mask.
Channels 4 and 5 share one waveform. SCC+ independent fifth waveform is not supported.
The game must detect/select the SCC slot, map its page, and enable SCC (typically 3Fh at
9000h in a compatible cartridge) before playback. Never blindly write SCC addresses in an
unmapped slot: that can overwrite RAM or switch the game's mapper. Mapping is game-specific.

The VGM header uses 1,789,773 Hz for SCC following VGM/libvgm's half-clock convention
(its K051649 core doubles that value). Register JSON reports the actual MSX master clock.

## Integration checklist

1. Include `song.h`, implement `msx_write`, then include `msx_player.h`.
2. Initialize available hardware and slot mapping. Allocate unused audio channels for SFX.
3. Call `msx_song_start`, then `msx_song_tick` at the declared rate; stop with `msx_song_stop`.
4. Measure worst-case interrupt duration. Wave initialization and nonzero loop restoration
   can exceed a tight ISR budget; do initialization outside VBlank when appropriate.
5. Arrays exceeding 16 KiB require a deliberate linker/bank placement strategy. The supplied
   player assumes the complete array is continuously addressable; it does not bank-switch.
   For large streams use registers.json to build a bank-aware driver. Streams above 65535
   bytes cannot be used directly with a 16-bit pointer player.
6. Compare emulator audio and register logs, then test the target MSX and cartridge.

The reference scheduler is host-tested. No Z80 build, complete MSX machine emulator, or
physical MSX validation has been performed for this release. VGM/WAV playback alone does
not establish correct slot handling, port delays, CPU load, or ROM bank placement.

WAV is a preview at 44.1 kHz / 16-bit mono using emu2149, emu2413 and emu2212. It includes
one song pass and a short release tail; loops are represented in project/VGM/stream metadata.
Mixer scaling is fixed; it is not a calibrated model of a particular MSX's analog output.
