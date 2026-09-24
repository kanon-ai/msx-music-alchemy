# Gymnopédie No.1 — Vibes Jazz & Chorus

Erik Satie (1866–1925), Gymnopédie No.1 (1888).
MSX Music Alchemy / ASTRAによるMCP編曲サンプル。人間による試聴と音色・バランスのフィードバックを反映しています。

## 再生

MSX Music Alchemy v0.3.0以降を起動し、「読み込む」から `song.msx.json` を選択。
先頭へ戻して再生してください。現在の曲は先にJSON保存してください。

- 原調（調号シャープ2つ）、原譜全78小節、96 BPM、約2分30秒。
- ビブラフォン主旋律と16分音符遅れのエコー（約50%の振幅）。
- OPLLアコースティックベース、ピアノ伴奏3声、OPLLリズム。
- PSGコーラス3声。SCCは使用しません。
- 原譜は3/4、エディタの表示は固定4/4なので画面上の小節番号は原譜と異なります。
- リズム曲のMGS出力は未対応。JSON、WAV、VGM、レジスタデータ、ゲーム開発パックに対応。
- エミュレーションによる演奏です。MSX実機での再生確認は行っていません。

## MCPで試す

付属 `mcp_example.py` は標準ライブラリだけで動くJSON-RPCクライアントです。
ソース版のルートで `python samples/gymnopedie-jazz/mcp_example.py` を実行すると、
MCPの初期化、曲の検証、JSON/VGM出力を行います（画面の曲は変更しません）。
`--load` を付けると、起動中エディタの曲をローカルJSONに退避してから、revisionを指定して読み込みます。
`--wav` でWAV出力も実行します。別ポートは `--port 7914`。
Windows配布版では `--exe "C:\path\MSXMusicAlchemy.exe"` で同じ例を利用できます（クライアントにはPythonが必要）。

AIへの依頼例:

> get_composition_guideで制約を確認し、このサンプルを読み込んでください。
> 現在の曲をget_songで取得してJSONに保存した後、サンプルをvalidate_songで検証し、
> 最新revisionでset_songしてください。主旋律とエコーを保持し、PSGコーラスだけを弱めて比較してください。

この例は完成データをMCPで扱う手順です。一度のプロンプトで同じ編曲を再生成する保証はありません。

## 出典と利用条件

旋律・和声は次の公開原譜から再入力・照合しました。市販の練習用編曲譜や商用録音は同梱・使用していません。

- [原版スキャン / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:IMSLP03213-Satie-GymnopediesOrEd.pdf): 最初の4ページ。Public Domain Mark。
- [Mutopia, ID 37](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37): Public Domain、Evin Robertson、2014-12-14、原版を再録したDover版に基づく譜面。
  [LilyPond](https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.ly) /
  [MIDI](https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.mid)。
  新しい翻訳注釈はこのLilyPondには含まれていません。

使用した原資料のSHA-256は `source-hashes.json` に記載。
原曲・上記公開原資料のパブリックドメインの地位はそのままです。
今回追加した編曲データ、クライアント、付属説明は、権利が成立する範囲で同梱のMIT Licenseにより提供します。
商用利用・改変・再配布が可能です。MITの表示条件を守り、作曲者と原曲名もクレジットしてください。
同リリースのMP4はこのデータを本ツールで独自にレンダリングした演奏・画面収録です。
