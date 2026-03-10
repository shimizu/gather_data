# データカタログ - アーキテクチャ設計

## 目的

「◯◯に関連するデータを探して」と指示すると、AIエージェントが：
1. Webを検索してデータソースを発見する
2. 発見した情報を構造化してカタログに登録する
3. 次回以降はカタログから即座に回答できる（知識が蓄積される）

---

## 全体像

```
ユーザー
  │  「人口に関するデータを探して」
  ↓
エージェントコア (Claude API + ツール)
  │
  ├─① カタログ検索 ← まずローカルのカタログを探す
  │    ヒットあり → 結果を返す
  │
  ├─② Web検索 ← カタログになければWebを探す
  │    ├── Google検索 / データポータル検索
  │    ├── 見つけたページの内容を読み取り
  │    └── データセット情報を構造化して抽出
  │
  └─③ カタログ登録 ← 発見した情報をカタログに保存
       └── sources/*.yaml に追記・新規作成
```

### フロー詳細

```
[ユーザーのクエリ]
       ↓
[LLM] クエリを解釈し、ツールの使用を計画
       ↓
[Tool: search_catalog] ローカルカタログを検索
       ↓
   ┌── ヒットあり → 結果を整形して返答
   └── ヒットなし or 不十分
           ↓
       [Tool: web_search] Web検索でデータソースを探す
           ↓
       [Tool: fetch_page] 候補ページの内容を読み取る
           ↓
       [LLM] ページ内容からデータセット情報を構造化
           ↓
       [Tool: register_to_catalog] カタログに登録
           ↓
       ユーザーに結果を返答
```

---

## エージェントのツール定義

| ツール名 | 説明 | 入力 | 出力 |
|----------|------|------|------|
| search_catalog | ローカルカタログを検索 | query: string | マッチしたデータセット一覧 |
| web_search | Webを検索してデータソース候補を取得 | query: string | 検索結果（URL+スニペット） |
| fetch_page | 指定URLのページ内容を取得 | url: string | ページのテキスト内容 |
| register_to_catalog | データセット情報をカタログに登録 | source + dataset情報 | 登録結果 |
| list_catalog | カタログの一覧・統計を表示 | filter?: object | ソース/データセット一覧 |

---

## カタログのデータ構造

### サイト単位 (YAML)

```yaml
# sources/estat.yaml
source:
  id: estat
  name: e-Stat (政府統計の総合窓口)
  url: https://www.e-stat.go.jp/
  description: 日本の政府統計を横断的に検索・閲覧できるポータルサイト
  provider: 総務省統計局
  category: government  # government / international / private / academic
  api:
    available: true
    base_url: https://api.e-stat.go.jp/rest/3.0/app/
    auth:
      type: api_key          # api_key / oauth / none
      key_env: ESTAT_API_KEY  # 環境変数名
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
    url: https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00200521
    update_frequency: 5years
    last_confirmed: 2026-03-10
    access_method: api        # api / download / scrape
    notes: |
      API経由でstatsDataIdを指定してデータ取得可能。
      appIdが必要。
```

### フィールド定義

#### source (サイト情報)

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | string | YES | サイトの一意ID |
| name | string | YES | サイト名 |
| url | string | YES | サイトのトップURL |
| description | string | YES | サイトの概要 |
| provider | string | YES | 提供組織 |
| category | enum | YES | government / international / private / academic |
| api.available | bool | YES | APIの有無 |
| api.base_url | string | NO | APIのベースURL |
| api.auth.type | enum | NO | api_key / oauth / none |
| api.auth.key_env | string | NO | APIキーの環境変数名 |
| api.docs_url | string | NO | APIドキュメントURL |
| formats | list | YES | 対応フォーマット |

#### datasets (データセット情報)

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | string | YES | データセットの一意ID |
| name | string | YES | データセット名 |
| description | string | YES | データセットの説明 |
| tags | list | YES | 検索用タグ（日本語・英語） |
| url | string | YES | データセットのURL |
| update_frequency | string | NO | 更新頻度 (daily/monthly/yearly/5years/irregular) |
| last_confirmed | date | YES | 最後に存在を確認した日付 |
| access_method | enum | YES | api / download / scrape |
| notes | string | NO | 取得時の補足情報 |

---

## ディレクトリ構成

```
gather_data/
├── plan.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # エントリポイント (対話ループ)
│   ├── agent.ts            # エージェントコア (Claude API + ツール実行)
│   ├── tools/
│   │   ├── search-catalog.ts   # カタログ検索ツール
│   │   ├── web-search.ts       # Web検索ツール
│   │   ├── fetch-page.ts       # ページ取得ツール
│   │   ├── register.ts         # カタログ登録ツール
│   │   └── list-catalog.ts     # カタログ一覧ツール
│   ├── catalog.ts          # カタログ読み書きロジック
│   └── types.ts            # 型定義 (Zod schemas)
├── sources/                # データカタログ本体 (AIが自動追記)
│   └── (最初は空 or シード数件)
└── tests/
    ├── catalog.test.ts
    └── search-catalog.test.ts
```

---

## インターフェース

### 対話型CLI

```bash
$ npx tsx src/index.ts

> 人口に関するデータを探して

🔍 カタログを検索中...
📡 カタログに該当なし。Webを検索します...

見つかったデータソース:

[1] 国勢調査 人口等基本集計 (e-Stat)
    URL: https://www.e-stat.go.jp/...
    取得方法: API (appId必要)
    形式: CSV, JSON, XML

[2] 住民基本台帳に基づく人口 (e-Stat)
    URL: https://www.e-stat.go.jp/...
    取得方法: API
    形式: CSV, JSON

[3] World Population Prospects (UN)
    URL: https://population.un.org/wpp/
    取得方法: ダウンロード
    形式: Excel, CSV

✅ 3件をカタログに登録しました。

> 前回見つけた人口データのうち、日本の都道府県別のものは？

🔍 カタログを検索中...
[1] 国勢調査 人口等基本集計 (e-Stat)
    タグ: 人口, 世帯, 国勢調査, 都道府県, 市区町村
    ...
```

### ワンショットモード（将来）

```bash
$ gather-data "GDPに関するデータ"
```

---

## 技術スタック

| 要素 | 選定 | 理由 |
|------|------|------|
| 言語 | TypeScript 5.x | 型安全 |
| ランタイム | Node.js 22+ | LTS |
| LLM | Claude API (Anthropic SDK) | tool use対応、日本語に強い |
| CLI対話 | readline (標準) | 依存なし |
| バリデーション | Zod | スキーマ→型推論 |
| YAML | yaml (npm) | YAML 1.2準拠 |
| Web検索 | Google Custom Search API or SerpAPI | 構造化された検索結果 |
| ページ取得 | undici (fetch) | Node.js標準 |
| テスト | Vitest | 高速 |

---

## 実装の優先順位

1. **プロジェクト初期化** - package.json, tsconfig.json
2. **型定義** (types.ts) - Zodスキーマ
3. **カタログ読み書き** (catalog.ts) - YAML読み込み・保存・検索
4. **ツール実装** (tools/) - 各ツールの実装
5. **エージェントコア** (agent.ts) - Claude API + tool use ループ
6. **対話CLI** (index.ts) - readline対話ループ
7. **テスト**

---

## 将来の拡張

- **MCP Server化**: このエージェントをMCP Serverとして公開 → Claude Codeから直接呼べる
- **データダウンロード機能**: カタログに登録済みのデータを実際にダウンロード
- **定期巡回**: カタログのURLが生きているか定期チェック
- **カタログの共有**: sources/をGitリポジトリとして公開、コミュニティで育てる
