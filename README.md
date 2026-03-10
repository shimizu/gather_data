# gather-data

AIエージェントがWebを検索してデータソースを発見し、ローカルのカタログに自動登録するCLIツール。

使うほどカタログが育ち、「どこに何のデータがあるか」を蓄積していく。

## セットアップ

```bash
npm install
```

## 環境変数

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 使い方

```bash
npm start
```

対話型CLIが起動する。起動時にYAMLからSQLiteインデックスを自動構築し、自然言語でデータソースを探せる。

```
=== データカタログ AIエージェント ===
カタログ読み込み完了: 7 ソース, 18 データセット
データソースを探すクエリを入力してください。(終了: "exit")

> 人口に関するデータを探して
```

### 動作の流れ

1. まずSQLite FTS5でローカルカタログを全文検索する
2. 該当がなければWebを検索してデータソースを発見する
3. 見つけた情報を構造化してカタログに自動登録する (SQLite + YAML 同時書き込み)
4. 次回以降は蓄積されたカタログから即座に回答する

### 入力例

```
> 都道府県別の人口データを探して
> GDPに関する国際比較データはある？
> 気象データを提供しているサイトを教えて
> カタログに何が登録されているか見せて
```

### 終了

```
> exit
```

## カタログ

### データの保存先

- **YAML** (`sources/カテゴリ/*.yaml`) - マスターデータ。人間が読める形式でGit管理
- **SQLite** (`catalog.db`) - 検索用インデックス。自動生成、`.gitignore` 対象

### カテゴリ別ディレクトリ

```
sources/
├── government/      # 政府系 (e-Stat, RESAS 等)
├── international/   # 国際機関 (World Bank, IMF 等)
├── private/         # 民間 (Kaggle 等)
└── academic/        # 学術
```

### YAML形式

手動で追加・編集することもできる。

```yaml
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
      type: api_key
      key_env: ESTAT_API_KEY
    docs_url: https://www.e-stat.go.jp/api/
  formats:
    - csv
    - json

datasets:
  - id: population_census
    name: 国勢調査 人口等基本集計
    description: 5年ごとの全数調査による日本の人口・世帯の基本統計
    tags:
      - 人口
      - 世帯
      - 都道府県
    url: https://www.e-stat.go.jp/stat-search/files?toukei=00200521
    last_confirmed: "2026-03-10"
    access_method: api
    notes: appIdが必要
```

### カタログの再構築

YAMLを手動で編集した後、SQLiteインデックスを再構築する。

```bash
npm run build:catalog
```

## テスト

```bash
npm test
```

## ディレクトリ構成

```
gather_data/
├── src/
│   ├── index.ts                  # 対話型CLIエントリポイント
│   ├── agent.ts                  # エージェントコア (Claude API + tool use)
│   ├── db.ts                     # SQLite初期化・マイグレーション
│   ├── catalog.ts                # カタログ読み書き (SQLite + YAML)
│   ├── build-catalog.ts          # YAML → SQLite再構築スクリプト
│   ├── types.ts                  # Zodスキーマ・型定義
│   └── tools/
│       ├── search-catalog.ts     # FTS5全文検索
│       ├── web-search.ts         # Web検索
│       ├── fetch-page.ts         # ページ内容取得
│       ├── register.ts           # カタログ登録 (SQLite + YAML同時書き込み)
│       ├── catalog-stats.ts      # 統計サマリー
│       └── get-source-detail.ts  # ソース詳細取得
├── sources/                      # データカタログ YAML (カテゴリ別)
│   ├── government/
│   ├── international/
│   ├── private/
│   └── academic/
├── catalog.db                    # SQLiteインデックス (.gitignore)
└── tests/
    └── catalog.test.ts
```
