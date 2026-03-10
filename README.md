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

対話型CLIが起動する。自然言語でデータソースを探せる。

```
=== データカタログ AIエージェント ===
データソースを探すクエリを入力してください。(終了: "exit")

> 人口に関するデータを探して
```

### 動作の流れ

1. まずローカルカタログ (`sources/*.yaml`) を検索する
2. 該当がなければWebを検索してデータソースを発見する
3. 見つけた情報を構造化してカタログに自動登録する
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

`sources/` ディレクトリにYAMLファイルとして保存される。最初は空で、エージェントが自動的に追加していく。

手動で追加・編集することもできる。形式は以下の通り。

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

## テスト

```bash
npm test
```

## ディレクトリ構成

```
gather_data/
├── src/
│   ├── index.ts              # 対話型CLIエントリポイント
│   ├── agent.ts              # エージェントコア (Claude API + tool use)
│   ├── catalog.ts            # カタログ読み書き・検索
│   ├── types.ts              # Zodスキーマ・型定義
│   └── tools/
│       ├── search-catalog.ts # ローカルカタログ検索
│       ├── web-search.ts     # Web検索
│       ├── fetch-page.ts     # ページ内容取得
│       ├── register.ts       # カタログ登録
│       └── list-catalog.ts   # カタログ一覧表示
├── sources/                  # データカタログ (YAML、自動生成)
└── tests/
    └── catalog.test.ts
```
