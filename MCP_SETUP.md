# MSX Music Alchemy — MCP接続

Windows配布版はPython不要です。`command` に展開した `MSXMusicAlchemy.exe` の絶対パス、
`args` に `["--mcp"]` を設定してください。通常起動でエディタも開いておきます。

stdio MCPサーバーです。まず `start.bat` でエディタを起動してください。
MCPクライアントのサーバー設定に以下を追加します（設定キーはクライアントに合わせてください）。

```json
{
  "mcpServers": {
    "msx-music-alchemy": {
      "command": "python",
      "args": ["C:\\path\\to\\msx-music-alchemy\\mcp_server.py"]
    }
  }
}
```

別ポートを指定した場合、args末尾に `"--port", "番号"` を追加します。
`C:\\path\\to` は実際の展開先に置き換えてください。commandのpythonが見つからない場合は
Python実行ファイルの絶対パスを指定します。
MCPはローカルエディタを操作するので、リモートのクラウドクライアントからは直接接続できません。
接続設定の反映・クライアント内の実接続はこの配布物の作成時には実施していません。

## ツール

| ツール | 機能 |
|---|---|
| get_composition_guide | AI向け制約とJSON schema |
| get_song | 画面で開いている曲と更新番号 |
| new_song | 空の曲を返す（画面は変更しない） |
| set_song | 更新番号を照合して曲を反映 |
| set_track_notes | 指定トラックだけノートを変更 |
| import_mml | MGSC基本構文を解析してJSONを返す |
| validate_song | 音域、単音、フレーム、SCC波形共有などを検証 |
| export_song | outputsフォルダにJSON/WAV/VGM/C/ZIP等を新規保存 |

AIへの指示例:

> get_composition_guideとget_songを読んでください。現在のPSGメロディは変更せず、
> SCCに8小節のアルペジオを作曲してください。OPLLには控えめなベースを追加し、
> validate_songで検証してから更新番号を指定してset_songで反映してください。

stdin/stdoutはUTF-8の1行1JSON-RPC。stdoutにログを混ぜません。
初期化、通知、ping、tools/list、tools/callに対応。未知のメソッドはJSON-RPCエラー、
楽曲検証等のツールエラーはisError=trueで返します。MCPサーバー自体に生成AIは内蔵していません。

エディタのHTTPサーバーは127.0.0.1のみで待ち受けます。Host/Origin検査と起動毎の
トークンを使用します。他のローカルプロセスに対するアクセス制御境界ではありません。
自分のPC上で信頼するMCPクライアントから接続してください。
