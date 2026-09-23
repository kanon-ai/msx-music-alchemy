# v0.1.0 validation

Environment: Windows 11 x64, CPython 3.13.5, Node 22.17.0, MSVC 19.44, CMake 3.26.

- 30 automated tests: model constraints, monophony, SCC shared wave, note boundaries,
  PAL/NTSC frame timing, key-off/key-on ordering, loop state restoration, deterministic
  render, each chip's non-silent A4/fundamental measurement, MML semantics/errors,
  binary and VGM reconstruction, ZIP contents, MCP stdio protocol and exports,
  HTTP/MCP shared state, persistence, stale revisions and invalid-request rejection.
- The actual C reference player was compiled and compared against the register compiler:
  exact order and frame timing across three loop passes, 3,716 writes, including a
  nonzero loop start. This is a host C test, not a Z80 execution test.
- Browser checks: step entry C/E/G, Undo/Redo, matching piano-roll notes, drag from
  G4 at tick 48 to A4 at tick 72; emulated playback and stop; OPLL/SCC inspectors;
  export dialog; final blue companion styling with the original dark piano roll.
- Live MCP stdio: initialize, get_song, set_track_notes for eight notes on PSG2;
  confirmed the editor showed those eight pitches and the new revision automatically.
- The GIF is made from actual local editor screenshots and playback frames. It is a
  short silent overview, not a recording of real MSX hardware or external AI generation.
- Windows package: executable HTTP startup, WAV preview, ZIP game export, and standalone
  `--mcp` initialize/get_composition_guide/get_song succeeded. Packaged WAV bytes exactly
  matched source execution (SHA-256 `50b6a9c7873ab9f2a5ebec9bf84c900be2cf5a4b439405bcb53ba302844a5e45`).
- GUI MML import produced the expected C4/D4/E4/F4 notes and Undo restored the prior song.

Reproduction:

```powershell
python -m unittest discover -s tests -v
node --check static/app.js
python tests/verify_player.py
```

Not validated: physical MSX, a complete MSX system emulator, Z80 compiler output, ROM
bank switching, SCC slot setup, CPU-specific I/O delays, Linux/macOS packaging, or
registration inside a third-party MCP client. The bundled MCP implementation was tested
directly over stdio, and its GUI synchronization was tested through the loopback service.
