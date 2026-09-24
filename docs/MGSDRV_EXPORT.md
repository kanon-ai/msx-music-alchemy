# MGSDRV出力

「ゲームへ出力 → MGSDRV (.mgs)」で保存します。MCPでは `export_song` に
`format: "mgs"` と拡張子を除く `filename` を指定します。
画面からの保存名はMSX-DOS用に英数字等8文字以内にします。MCPでも実機用には8文字以内の名前を推奨します。
エディタの曲を直接変換するため、MGSCのインストールは不要です。

## 対応範囲

- PSG 3、SCC 5、OPLL 9チャンネル（メロディモード）。
- 音程、1/60秒単位の開始・終了、音量、休符。
- OPLLの15 ROM音色と共通カスタム音色、SCCの32バイト波形。
- ミュート、全曲ループ、途中からのループ。soloは試聴専用で出力に反映しません。
- 曲名はShift-JIS系CP932で保存。表現できない文字は `?`、制御文字は空白に置換。

MGS303のフレーム長命令を使用し、細かな発音タイミングを保存します。
MGSDRV v3対応プレイヤーで再生してください。更新周波数60 Hz専用です。
50 Hzの曲、1フレーム未満の音、バイナリ部分が16 KiBを超える曲はエラーになります。
音符を黙って省略したり、曲を切り詰めたりはしません。
標準SCCの4/5チャンネルは波形を共有します。

音程テーブルの丸め、音源ごとのミックス比、FMの発音処理はMGSDRVとエディタで
異なるため、完全に同一の波形にはなりません。MASTER音量補正は試聴専用です。
NTSC実機相当の約59.94 Hzでは、エディタの60 Hzより演奏時間がわずかに長くなります。
MGSから編集データへのインポートは未対応です。編集用JSONも保存してください。
ゲーム開発パックZIPの既存内容は変えず、MGSは個別出力です。

## MSXで聴く

生成した `.mgs` をMSXのストレージにコピーし、MGSDRV v3対応のプレイヤーで開きます。
全パートを聴くにはPSGに加えMSX-MUSIC/FM-PAC相当のOPLLと標準SCCが必要です。
プレイヤーに合わせたRAM・DOS等の条件は、[MGSDRV公式配布元](https://gigamix.hatenablog.com/entry/mgsdrv/)
の「聴くための最低限の動作環境とファイル」を参照してください。
MGSDRV本体、MSX用プレイヤー、BIOS、DOSは本ツールに同梱しません。

## 検証

2026-09-24: libkssのMGSDRV実行環境で全17チャンネルの音程・音量、FMプリセット、
カスタム音色、途中ループと演奏終了を検証。「Moonlit Letters」は約10 KiBで全曲再生を確認。
通常のPythonテストではチャンネル順序、休符・長音、波形データ、サイズ制限、
HTTP/MCP出力、入力データの不変性も確認しています。物理MSX実機では未検証です。

フォーマット参考: [MGSDRV v3 data format](https://github.com/digital-sound-antiques/mgsc/blob/master/mgs-format.md)。
出力処理は独自実装で、他プロジェクトのコンパイラやドライバのバイナリは含みません。


### OPLL rhythm (experimental)
Optional `opllRhythm: true` reserves OPLL channels 6–8 (zero based) for percussion. MIDI keys: channel 6 = 36 (bass drum), channel 7 = 38 (snare) / 42 (hi-hat), channel 8 = 45 (tom) / 49 (cymbal). Each track remains monophonic. Instrument is ignored on these three channels. Use velocity 1–15 and explicit short note durations; notes must last at least one frame. Omit the field for unchanged nine-channel melodic playback. WAV, VGM, register JSON and game bundles support rhythm; MGS export rejects rhythm songs explicitly. No hardware validation yet.
Reference: [Yamaha YM2413 application manual](https://www.smspower.org/maxim/Documents/YM2413ApplicationManual).
