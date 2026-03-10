# アーキテクチャ

## システム概要

gather-data は Claude API の tool use を活用したAIエージェント型データカタログ。
ユーザーの自然言語クエリに対して、ローカルカタログの検索 → Web探索 → 自動登録を自律的に行う。

## コンポーネント構成

```
┌──────────────────────────────────────────────────────┐
│  CLI (index.ts)                                      │
│  readline対話ループ                                    │
└──────────────┬───────────────────────────────────────┘
               │ userMessage
               ▼
┌──────────────────────────────────────────────────────┐
│  エージェントコア (agent.ts)                            │
│  Claude API + tool use ループ                         │
│  model: claude-sonnet-4-20250514                     │
│                                                      │
│  ┌─ ツール群 ────────────────────────────────────┐   │
│  │  search_catalog  → FTS5全文検索               │   │
│  │  web_search      → Google検索                 │   │
│  │  fetch_page      → ページ取得・テキスト化      │   │
│  │  register_to_catalog → カタログ登録            │   │
│  │  catalog_stats   → 統計サマリー               │   │
│  │  get_source_detail → ソース詳細取得           │   │
│  └───────────────────────────────────────────────┘   │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  データ層                                             │
│                                                      │
│  ┌── catalog.ts ──────────────────────────────────┐  │
│  │  searchCatalog()   → SQLite FTS5 読み取り      │  │
│  │  registerEntry()   → SQLite + YAML 同時書き込み │  │
│  │  rebuildIndex()    → YAML → SQLite 全件再構築  │  │
│  │  getCatalogStats() → 統計集計                  │  │
│  │  getSourceDetail() → ソース個別取得            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌── ストレージ ──────────────────────────────────┐  │
│  │  sources/**/*.yaml  マスターデータ (Git管理)    │  │
│  │  catalog.db         検索インデックス (.gitignore)│  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## エージェントループ

```
runAgent(userMessage)
  │
  ├─ messages = [{role: "user", content: userMessage}]
  │
  └─ while (true) {
       │
       ├─ Claude API 呼び出し (messages, tools, system prompt)
       │
       ├─ response.content を解析
       │    ├─ TextBlock[] → 最終回答候補
       │    └─ ToolUseBlock[] → ツール実行指示
       │
       ├─ ToolUseBlock がなければ → TextBlock を結合して return
       │
       └─ ToolUseBlock があれば
            ├─ 各ツールを実行
            ├─ messages に assistant content + tool_result を追加
            └─ ループ継続
     }
```

ツール呼び出しがなくなるまで繰り返す。1回のクエリで複数ツールが連鎖的に呼ばれる。

## データフロー

### 検索 (カタログにデータがある場合)

```
ユーザー入力 → search_catalog → FTS5検索 → 結果返却
```

### 発見・登録 (カタログにない場合)

```
ユーザー入力
  → search_catalog (該当なし)
  → web_search (Google検索)
  → fetch_page (候補ページ確認)
  → LLM が情報を構造化
  → register_to_catalog
      ├─ Zod バリデーション
      ├─ SQLite UPSERT (即座に検索可能)
      └─ YAML書き出し (永続化)
  → ユーザーに結果報告
```

## デュアルストレージ設計

| | YAML | SQLite |
|---|---|---|
| 役割 | マスターデータ | 検索インデックス |
| Git管理 | する | しない (.gitignore) |
| 人間が読める | Yes | No |
| 検索速度 | 遅い (全件走査) | 速い (FTS5) |
| 書き込み | registerEntry + saveYaml | registerEntry + UPSERT |
| 再構築 | - | `npm run build:catalog` |

起動時に YAML → SQLite の再構築を自動実行する。
YAML を手動編集した場合は `npm run build:catalog` で再構築する。

### registerEntry の更新挙動

`registerEntry()` は新規登録と更新の両方を処理する:

- **SQLite**: `UPSERT` で source / dataset を更新
- **FTS5**: 既存データセットは rowid ベースで DELETE → 同じ rowid で INSERT して検索インデックスを同期。`datasets.rowid` と `datasets_fts.rowid` を明示的に一致させることで `searchCatalog()` の JOIN 整合性を保証する
- **YAML**: source 情報は丸ごと上書き、datasets は ID ベースでマージ（既存 dataset も最新値に更新）
- **カテゴリ変更**: 新カテゴリに書き込む前に、他カテゴリにある同一 source.id の YAML を自動削除して重複を防止

### YAML 読み込みの耐障害性

`loadAllYaml()` は壊れた YAML ファイルに遭遇してもクラッシュせず、警告を出してスキップする。YAML 構文エラーと Zod バリデーションエラーの両方を捕捉する。

## SQLiteスキーマ

```sql
sources
├── id (PK)
├── name, url, description, provider
├── category (CHECK: government/international/private/academic)
├── api_json (JSON文字列)
├── formats (JSON配列)
└── created_at, updated_at

datasets
├── (source_id, id) (PK)
├── name, description
├── tags (JSON配列)
├── url, update_frequency, last_confirmed
├── access_method (CHECK: api/download/scrape)
├── notes
└── created_at

datasets_fts (FTS5仮想テーブル)
├── name
├── description
├── tags (スペース区切りテキスト)
└── source_name
    tokenize='unicode61'
```

`datasets_fts` は `datasets` テーブルの `rowid` で JOIN して使う。
`rebuildIndex()` と `registerEntry()` では FTS5 挿入時に rowid を明示指定し、datasets との対応を保証している。

## ディレクトリ構成

```
gather_data/
├── src/
│   ├── index.ts              # CLI エントリポイント
│   ├── agent.ts              # エージェントコア
│   ├── db.ts                 # SQLite 初期化・マイグレーション
│   ├── catalog.ts            # カタログ CRUD (SQLite + YAML)
│   ├── build-catalog.ts      # YAML → SQLite 再構築スクリプト
│   ├── types.ts              # Zod スキーマ・TypeScript 型
│   └── tools/                # エージェントツール群
│       ├── search-catalog.ts
│       ├── web-search.ts
│       ├── fetch-page.ts
│       ├── register.ts
│       ├── catalog-stats.ts
│       └── get-source-detail.ts
├── sources/                  # YAML マスターデータ
│   ├── government/
│   ├── international/
│   ├── private/
│   └── academic/
├── catalog.db                # SQLite (自動生成, .gitignore)
└── tests/
```
