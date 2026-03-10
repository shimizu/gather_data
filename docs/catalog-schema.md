# カタログスキーマリファレンス

## YAML形式

各データソースは `sources/{category}/{source_id}.yaml` に保存される。

### 完全な例

```yaml
source:
  id: bea                        # 英数字+アンダースコアの一意ID
  name: U.S. Bureau of Economic Analysis (BEA)
  url: https://www.bea.gov/
  description: アメリカ商務省の経済分析局。GDP、個人所得、国際収支等の公式経済統計を作成・公表
  provider: U.S. Department of Commerce
  category: government           # government | international | private | academic
  api:                           # (省略可)
    available: true
    base_url: https://apps.bea.gov/api/
    auth:
      type: api_key              # api_key | oauth | none
      key_env: BEA_API_KEY       # APIキーを格納する環境変数名
    docs_url: https://apps.bea.gov/api/_pdf/BEA_Web_API_Documentation.pdf
  formats:
    - csv
    - excel
    - api

datasets:
  - id: bea_gdp                  # ソース内で一意のID
    name: Gross Domestic Product
    description: アメリカGDPの公式統計。四半期・年次データ、実質・名目値
    tags:
      - GDP
      - 経済成長
      - 公式統計
      - 四半期
    url: https://www.bea.gov/data/gdp
    update_frequency: quarterly  # daily | monthly | quarterly | yearly | 5years | irregular
    last_confirmed: "2026-03-10" # 最後に存在を確認した日付
    access_method: download      # api | download | scrape
    notes: |                     # (省略可)
      National Income and Product Accounts (NIPA) の一部。
      API利用にはBEA_API_KEYが必要。
```

### API情報なしの例

```yaml
source:
  id: worldpop
  name: WorldPop
  url: https://www.worldpop.org/
  description: 高解像度の人口分布推計データ
  provider: University of Southampton
  category: academic
  formats:
    - geotiff
    - csv

datasets:
  - id: pop_density
    name: Population Density
    description: 100mグリッドの人口密度推計
    tags:
      - 人口
      - 密度
      - GIS
      - ラスター
    url: https://www.worldpop.org/geodata/listing?id=64
    last_confirmed: "2026-03-10"
    access_method: download
```

## フィールドリファレンス

### source (必須フィールド)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | サイトの一意ID。ファイル名にも使われる |
| name | string | サイトの表示名 |
| url | string | サイトのトップURL |
| description | string | サイトの概要説明 |
| provider | string | 提供組織名 |
| category | enum | `government` `international` `private` `academic` |
| formats | string[] | 提供データ形式のリスト |

### source.api (省略可)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| available | boolean | APIの有無 |
| base_url | string? | APIのベースURL |
| auth.type | enum? | `api_key` `oauth` `none` |
| auth.key_env | string? | APIキーの環境変数名 |
| docs_url | string? | APIドキュメントのURL |

### dataset (必須フィールド)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ソース内で一意のID |
| name | string | データセット名 |
| description | string | データセットの説明 |
| tags | string[] | 検索用タグ (日本語・英語) |
| url | string | データセットのURL |
| last_confirmed | string | 最終確認日 (YYYY-MM-DD) |
| access_method | enum | `api` `download` `scrape` |

### dataset (省略可フィールド)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| update_frequency | string? | 更新頻度 (daily/monthly/quarterly/yearly/5years/irregular) |
| notes | string? | 取得時の補足情報、制約事項 |

## カテゴリ分類基準

| カテゴリ | 対象 | 例 |
|---------|------|-----|
| government | 政府機関が提供するデータ | e-Stat, RESAS, FRED, BEA |
| international | 国際機関が提供するデータ | World Bank, IMF, OECD, UN |
| private | 民間企業・団体が提供するデータ | Kaggle, 企業IR情報 |
| academic | 大学・研究機関が提供するデータ | WorldPop, GeoEPR |

## タグ付けのガイドライン

- データの主題を表すキーワードを付ける (例: `人口`, `GDP`, `気象`)
- 日本語と英語の両方を含めると検索精度が上がる (例: `人口`, `population`)
- 地理的範囲を含める (例: `日本`, `都道府県`, `グローバル`)
- データの粒度・頻度を含める (例: `月次`, `四半期`, `市区町村`)
- 5〜10個程度が目安
