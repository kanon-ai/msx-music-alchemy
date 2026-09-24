# Third-party components

The following MIT-licensed emulators are by Mitsutaka Okazaki and contributors. Sources are unchanged; each full license is in vendor/<name>/LICENSE.

- [emu2149](https://github.com/digital-sound-antiques/emu2149) — commit `441f3dc295a9b82db16921461f0678b483db8304`
- [emu2413](https://github.com/digital-sound-antiques/emu2413) — legacy source only, no longer built; commit `11676f6c43af7a53a0a940f8faea57eed73a22ba`
- [emu2212](https://github.com/digital-sound-antiques/emu2212) — commit `e1735c83707e6ee739a123476344659f7fa9fb18`

MGSC import is an original limited parser based on the official MGSC 1.11 manual, https://p.gigamix.jp/mgsdrv/MGSC111.TXT . No MGSC binary or MGSDRV driver is bundled.
MCP transport reference: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
VGM reference: https://github.com/vgmrips/vgmplay-legacy/blob/master/VGMPlay/vgmspec171.txt
No user BIOS, ROM or commercial recordings are included. Public-domain score samples carry their own source notices.

The Windows binary distribution bundles CPython 3.13.5, PyInstaller 6.20.0's bootloader
(GPL with its bootloader exception), and OpenSSL 3.0.16 runtime libraries. Complete
notices are in `licenses/` in the source and `_internal/licenses/` in the Windows package.
Source code written for this project is covered by the root MIT LICENSE.

The interface follows the user's RETRO / SFX companion-tool styling. No hardware vendor
logos, proprietary font files, or commercial music assets are bundled.

OPLL playback uses [ymfm](https://github.com/aaronsgiles/ymfm), commit `81aec25ccbb98f4873a255f7551ac4dadac59b4a`, by Aaron Giles and contributors (BSD 3-Clause). Upstream sources are unchanged in `vendor/ymfm`; the full license is `vendor/ymfm/LICENSE`.
