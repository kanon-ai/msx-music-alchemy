# v0.2.0 validation

- 34 Python tests passed, including existing editor model, audio, MML, HTTP and MCP tests.
- JavaScript syntax check and git whitespace check passed.
- MGS export: 17 channels, pitch/volume, FM presets/custom patch, SCC wave serialization,
  long notes, silence, mute, nonzero loops, capacity and 50 Hz rejection tested.
- Independent libkss/MGSDRV execution verified all 17 channel pitches (maximum deviation
  4.62 cents for the test notes), volumes, FM patch selection and loop/stop behavior.
- A complete original composition exported as a 10,281-byte MGS and played to completion.
  Its NTSC timing difference matches the player's approximately 59.94 Hz clock.
- Browser output action and live HTTP/MCP byte equality verified.
- Preview gain and step-follow UI were verified locally during development; gain is
  preview-only and does not alter exported song volume.

Physical MSX hardware playback has not been tested. Source scores, private performances,
captures, validation player binaries and downloaded third-party drivers are not distributed.
