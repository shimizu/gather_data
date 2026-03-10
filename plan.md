# データカタログ - アーキテクチャ設計

## 目的

「◯◯に関連するデータを探して」と指示すると、AIエージェントが：
1. Webを検索してデータソースを発見する
2. 発見した情報を構造化してカタログに登録する
3. 次回以降はカタログから即座に回答できる（知識が蓄積される）

---

## 現在のスケーラビリティ課題

### 問題1: 毎回全YAMLを読み込んでいる

`loadCatalog()` が呼ばれるたびに `sources/*.yaml` を全ファイル読み込み・パースしている。
ファイル数が数十〜数百になるとI/O・パースコストが無視できなくなる。

### 問題2: フラットなディレクトリ構造

`sources/` 直下に全ファイルが並ぶため、数百ファイルになると見通しが悪い。

### 問題3: 全文検索が線形スキャン

全データセットの `name`, `description`, `tags` を毎回ループで走査している。
データセット数が増えるとO(N)で遅くなる。

### 問題4: エージェントのコンテキスト圧迫

`list_catalog` ツールがカタログ全体をテキストで返すため、
カタログが大きくなるとLLMのコンテキストウィンドウを圧迫する。

---

## 解決策: SQLiteインデックスの導入

YAMLをマスターデータ（人間が読める・Gitで管理できる）として維持しつつ、
SQLiteをインデックスとして併用する。

```
sources/*.yaml  ← マスターデータ (人間が編集可能、Git管理)
       ↓ ビルド
catalog.db (SQLite)  ← 検索用インデックス (自動生成、.gitignore)
       ↑ 登録時に同時書き込み
エージェント
```

### なぜSQLiteか

- **依存が軽い**: better-sqlite3 は単一バイナリ、外部サービス不要
- **FTS5 (全文検索)**: 日本語トークナイザ含め高速な全文検索をネイティブ対応
- **ゼロ設定**: ファイル1つで完結、サーバー不要
- **十分なスケール**: 数万〜数十万レコードでも問題ない

---

## 全体像

```
ユーザー
  │  「人口に関するデータを探して」
  ↓
エージェントコア (Claude API + ツール)
  │
  ├─① カタログ検索 (SQLite FTS5)
  │    ヒットあり → 結果を返す
  │
  ├─② Web検索 ← カタログになければWebを探す
  │    ├── Google検索 / データポータル検索
  │    ├── 見つけたページの内容を読み取り
  │    └── データセット情報を構造化して抽出
  │
  └─③ カタログ登録
       ├── SQLiteに書き込み (即座に検索可能)
       └── sources/*.yaml にも書き出し (永続化・Git管理)
```

---

## SQLiteスキーマ

```sql
-- ソース（サイト）テーブル
CREATE TABLE sources (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT NOT NULL,
  provider    TEXT NOT NULL,
  category    TEXT NOT NULL CHECK(category IN ('government','international','private','academic')),
  api_json    TEXT,          -- API情報をJSONで格納
  formats     TEXT NOT NULL, -- JSON配列 ["csv","json"]
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- データセットテーブル
CREATE TABLE datasets (
  id               TEXT NOT NULL,
  source_id        TEXT NOT NULL REFERENCES sources(id),
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  tags             TEXT NOT NULL, -- JSON配列 ["人口","世帯"]
  url              TEXT NOT NULL,
  update_frequency TEXT,
  last_confirmed   TEXT NOT NULL,
  access_method    TEXT NOT NULL CHECK(access_method IN ('api','download','scrape')),
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_id, id)
);

-- 全文検索インデックス (FTS5)
CREATE VIRTUAL TABLE datasets_fts USING fts5(
  name,
  description,
  tags,
  source_name,
  content='datasets',
  content_rowid='rowid',
  tokenize='unicode61'
);
```

### ポイント

- `datasets_fts` で `name`, `description`, `tags`, `source_name` を全文検索
- `tags` はJSON配列をスペース区切りテキストに変換してFTSに投入
- YAML → SQLite のビルドコマンドで再構築可能 (`npm run build:catalog`)
- 新規登録時はSQLite + YAMLの両方に同時書き込み

---

## エージェントのツール定義

| ツール名 | 説明 | 入力 | 出力 |
|----------|------|------|------|
| search_catalog | SQLite FTS5でカタログを検索 | query: string, limit?: number | マッチしたデータセット一覧 (上位N件) |
| web_search | Webを検索してデータソース候補を取得 | query: string | 検索結果（URL+スニペット） |
| fetch_page | 指定URLのページ内容を取得 | url: string | ページのテキスト内容 |
| register_to_catalog | データセット情報をカタログに登録 | source + dataset情報 | 登録結果 |
| catalog_stats | カタログの統計情報を表示 | なし | ソース数・データセット数・カテゴリ内訳 |
| get_source_detail | 特定ソースの詳細情報を取得 | source_id: string | ソース+全データセット |

### 変更点

- `list_catalog` → `catalog_stats` + `get_source_detail` に分離
  - 全件返すのではなく、統計サマリーか個別詳細を返す
  - LLMのコンテキストを圧迫しない
- `search_catalog` は `limit` パラメータで件数制御

---

## カタログのデータ構造 (YAML: 変更なし)

```yaml
# sources/government/estat.yaml
source:
  id: estat
  name: e-Stat (政府統計の総合窓口)
  url: https://www.e-stat.go.jp/
  description: 日本の政府統計を横断的に検索・閲覧できるポータルサイト
  provider: 総務省統計局
  category: government
  api:
    available: true
    base_url: https://api.e-stat.go.jp/rest/3.0/app/
    auth:
      type: api_key
      key_env: ESTAT_API_KEY
    docs_url: https://www.e-stat.go.jp/api/
  formats:
    - csv
    - json
    - xml

datasets:
  - id: population_census
    name: 国勢調査 人口等基本集計
    description: 5年ごとの全数調査による日本の人口・世帯の基本統計
    tags:
      - 人口
      - 世帯
      - 国勢調査
      - 都道府県
      - 市区町村
    url: https://www.e-stat.go.jp/stat-search/files?toukei=00200521
    update_frequency: 5years
    last_confirmed: 2026-03-10
    access_method: api
    notes: appIdが必要
```

---

## ディレクトリ構成

```
gather_data/
├── plan.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # エントリポイント (対話ループ)
│   ├── agent.ts              # エージェントコア (Claude API + ツール実行)
│   ├── db.ts                 # SQLite初期化・マイグレーション
│   ├── catalog.ts            # カタログ読み書き (SQLite + YAML)
│   ├── types.ts              # 型定義 (Zod schemas)
│   └── tools/
│       ├── search-catalog.ts     # FTS5検索
│       ├── web-search.ts         # Web検索
│       ├── fetch-page.ts         # ページ取得
│       ├── register.ts           # カタログ登録 (DB + YAML同時書き込み)
│       ├── catalog-stats.ts      # 統計サマリー
│       └── get-source-detail.ts  # ソース詳細取得
├── sources/                  # マスターデータ (カテゴリ別サブディレクトリ)
│   ├── government/
│   │   ├── estat.yaml
│   │   └── data_go_jp.yaml
│   ├── international/
│   │   ├── worldbank.yaml
│   │   └── imf.yaml
│   ├── private/
│   │   └── kaggle.yaml
│   └── academic/
├── catalog.db                # SQLiteインデックス (.gitignore)
└── tests/
    ├── catalog.test.ts
    └── search-catalog.test.ts
```

### sources/ のカテゴリ別サブディレクトリ

- `government/` - 政府系 (e-Stat, RESAS, data.go.jp, 国土数値情報 等)
- `international/` - 国際機関 (World Bank, IMF, OECD, UN 等)
- `private/` - 民間 (Kaggle, 企業IR 等)
- `academic/` - 学術 (論文データ、大学公開データ 等)

---

## CLIコマンド

```bash
# 対話モード (メイン)
npm start

# カタログのビルド (YAML → SQLite再構築)
npm run build:catalog

# 統計表示
npm run stats
```

---

## 技術スタック

| 要素 | 選定 | 理由 |
|------|------|------|
| 言語 | TypeScript 5.x | 型安全 |
| ランタイム | Node.js 22+ | LTS |
| LLM | Claude API (Anthropic SDK) | tool use対応、日本語に強い |
| DB | better-sqlite3 | 同期API、FTS5対応、サーバー不要 |
| CLI対話 | readline (標準) | 依存なし |
| バリデーション | Zod | スキーマ→型推論 |
| YAML | yaml (npm) | YAML 1.2準拠 |
| テスト | Vitest | 高速 |

---

## 実装の優先順位

1. **SQLite導入** (db.ts) - スキーマ作成、FTS5設定
2. **catalog.ts 改修** - SQLite読み書き + YAML同期
3. **ツール改修** - search-catalog をFTS5ベースに、list→stats+detail分離
4. **sources/ カテゴリ分け** - 既存YAMLをサブディレクトリに移動
5. **build:catalog コマンド** - YAML → SQLite再構築スクリプト
6. **テスト更新**

---

## 将来の拡張

- **MCP Server化**: このエージェントをMCP Serverとして公開 → Claude Codeから直接呼べる
- **データダウンロード機能**: カタログに登録済みのデータを実際にダウンロード
- **定期巡回**: カタログのURLが生きているか定期チェック
- **カタログの共有**: sources/をGitリポジトリとして公開、コミュニティで育てる
- **ベクトル検索**: Embeddingによるセマンティック検索の追加 (SQLite + sqlite-vss)
