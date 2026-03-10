# データカタログ - アーキテクチャ設計

## 目的

「どこに何のデータがあるか」を構造化して管理し、自然言語で検索できるようにする。

---

## 全体像

```
ユーザー (CLI)
  │
  │  「人口に関するデータを探して」
  ↓
検索インターフェース (Node.js CLI)
  │
  ├── キーワード検索 (タグ・名前のマッチング)
  └── LLM検索 (自然言語 → カタログから該当を抽出)
  │
  ↓
データカタログ (YAML ファイル群)
  ├── sources/
  │   ├── estat.yaml        # e-Stat
  │   ├── resas.yaml        # RESAS
  │   ├── data_go_jp.yaml   # data.go.jp
  │   ├── worldbank.yaml    # World Bank
  │   └── ...
  ↓
検索結果の表示
  ├── データセット名
  ├── 提供元・URL
  ├── 取得方法 (API / ダウンロード / スクレイピング)
  └── 備考 (APIキー要否、形式など)
```

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

  - id: cpi
    name: 消費者物価指数
    description: 全国の消費者物価指数（月次）
    tags:
      - 物価
      - CPI
      - 消費者物価
      - 経済指標
      - 月次
    url: https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00200573
    update_frequency: monthly
    last_confirmed: 2026-03-10
    access_method: api
    notes: ""
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
│   ├── cli.ts              # CLIエントリポイント
│   ├── catalog.ts          # カタログの読み込み・検索ロジック
│   ├── models.ts           # 型定義 (TypeScript interfaces + Zod schemas)
│   └── search.ts           # 検索エンジン (キーワード / LLM)
├── sources/                # データカタログ本体
│   ├── estat.yaml
│   ├── resas.yaml
│   ├── data_go_jp.yaml
│   ├── worldbank.yaml
│   └── ...
└── tests/
    ├── catalog.test.ts
    └── search.test.ts
```

---

## 検索の仕組み

### Phase 1: キーワード検索（LLMなし）

```bash
# 使い方
$ gather-data search "人口"

# 結果
[1] 国勢調査 人口等基本集計 (e-Stat)
    タグ: 人口, 世帯, 国勢調査, 都道府県
    取得方法: API
    URL: https://www.e-stat.go.jp/...

[2] World Population Prospects (World Bank)
    タグ: 人口, population, 世界, 予測
    取得方法: API
    URL: https://...
```

検索ロジック:
1. 全YAMLを読み込み
2. `name`, `description`, `tags` に対してクエリを部分一致検索
3. マッチしたデータセットをスコア順に表示

### Phase 2: LLM検索（将来）

- カタログ全体をコンテキストに入れてLLMに検索させる
- or Embeddingでベクトル検索
- 「経済の動向を分析したい」→ GDP、CPI、失業率 等を横断的に提案

---

## CLIインターフェース

```bash
# カタログからデータセットを検索
$ gather-data search "人口 都道府県"

# カタログの一覧表示
$ gather-data list
$ gather-data list --source estat
$ gather-data list --category government

# データソースの詳細表示
$ gather-data show estat/population_census

# カタログの統計情報
$ gather-data stats
# → 登録ソース数: 5, データセット数: 42, カテゴリ別内訳: ...
```

---

## 技術スタック

| 要素 | 選定 | 理由 |
|------|------|------|
| 言語 | TypeScript 5.x | 型安全、Node.jsエコシステム活用 |
| ランタイム | Node.js 22+ | LTS、ESM対応 |
| パッケージ管理 | npm | 標準的 |
| CLI | Commander.js | 軽量で定番 |
| バリデーション | Zod | TypeScriptとの相性◎、スキーマから型推論 |
| YAML | yaml (npm) | YAML 1.2準拠、型安全 |
| テスト | Vitest | 高速、ESM/TypeScriptネイティブ対応 |
| ビルド | tsx (実行) + tsc (型チェック) | 開発時はtsxで直接実行、CIでtsc |

---

## 実装の優先順位

1. **プロジェクト初期化** - package.json, tsconfig.json, Vitest設定
2. **型定義 + バリデーション** (models.ts) - Zodスキーマ + TypeScript型
3. **YAMLローダー** (catalog.ts) - sources/以下を読み込み・バリデーション
4. **キーワード検索** (search.ts) - タグ・名前の部分一致検索
5. **CLI** (cli.ts) - search / list / show コマンド
6. **カタログデータ投入** - まず2-3サイト分を手動で作成
7. **テスト** - 検索ロジックのユニットテスト
