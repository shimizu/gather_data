# 運用ガイド

## 日常運用

### カタログの確認

```bash
# SQLiteの統計を確認
sqlite3 catalog.db "SELECT COUNT(*) FROM sources; SELECT COUNT(*) FROM datasets;"

# カテゴリ別のソース数
sqlite3 catalog.db "SELECT category, COUNT(*) FROM sources GROUP BY category;"
```

### YAMLの手動編集後

YAML を直接編集・追加した場合は、SQLiteインデックスを再構築する:

```bash
npm run build:catalog
```

### カタログのバックアップ

`sources/` ディレクトリがマスターデータ。Git にコミットすればバックアップになる。
`catalog.db` はYAMLから再生成可能なので、バックアップ不要。

## トラブルシューティング

### ANTHROPIC_API_KEY エラー

```
[エラー] ANTHROPIC_API_KEY が設定されていません。
```

環境変数を設定する:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### YAML パースエラー

```
[WARN] xxx.yaml のバリデーションに失敗: ...
[WARN] xxx.yaml の読み込みに失敗 (スキップ): ...
```

壊れた YAML や `CatalogEntrySchema` に適合しない YAML はスキップされ、他のファイルの読み込みは継続される。
よくある原因:

- YAML 構文エラー（インデントずれ、不正な文字列等）
- `category` の値が `government` / `international` / `private` / `academic` 以外
- `access_method` の値が `api` / `download` / `scrape` 以外
- 必須フィールドが欠けている (`id`, `name`, `url`, `description`, `provider`, `formats`, `tags`, `last_confirmed`)

### FTS5 検索で期待した結果が出ない

```bash
# FTS5インデックスの中身を直接確認
sqlite3 catalog.db "SELECT * FROM datasets_fts WHERE datasets_fts MATCH '\"人口\"';"
```

インデックスが古い場合は再構築:
```bash
npm run build:catalog
```

### catalog.db が破損した場合

削除して再構築する:
```bash
rm catalog.db
npm run build:catalog
```

YAMLがマスターデータなので、catalog.db はいつでも再生成できる。

### Web検索が失敗する

`web_search` ツールは Google にHTTPリクエストを送る（10秒タイムアウト）。
以下の場合に失敗する可能性がある:

- ネットワーク接続がない
- Google からレート制限を受けた
- User-Agent がブロックされた
- 10秒以内に応答がない（タイムアウト）

エージェントは失敗時にエラーメッセージを返すので、別のクエリで再試行するか、
`fetch_page` で直接データポータルにアクセスする。

### ページ取得がタイムアウトする

`fetch_page` は15秒のタイムアウトが設定されている。
遅いサーバーやサイズの大きいページでは失敗する場合がある。

## SQLite の保守

### WAL ファイル

`catalog.db-wal` と `catalog.db-shm` が生成されることがある。
これは WAL (Write-Ahead Logging) モードの一時ファイルで、正常終了時にマージされる。
異常終了した場合はこれらのファイルが残るが、次回の接続時に自動でリカバリされる。

### DB サイズの確認

```bash
ls -lh catalog.db
sqlite3 catalog.db "SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size();"
```

### VACUUM (必要に応じて)

大量のデータを削除した後にファイルサイズを縮小したい場合:

```bash
sqlite3 catalog.db "VACUUM;"
```
