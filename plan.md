# データカタログ Webサイト — 実装計画

## 目的

`sources/` に登録済みのデータセットを閲覧できる静的Webサイトを構築し、GitHub Pages（gh-pages）でデプロイする。

---

## 設計方針

### ビルド時にYAMLを読み込み、静的HTMLを生成する

```
sources/**/*.yaml  →  ビルドスクリプト  →  dist/
                        (YAML→JSON変換)      ├── index.html
                                              ├── style.css
                                              ├── app.js
                                              └── catalog.json
```

- **フレームワーク不使用**: Vanilla HTML/CSS/JS で軽量に構築
- **catalog.json**: ビルド時にYAMLを全件読み込みJSON化。ブラウザ側はこのJSONをfetchして描画
- **SPA構成**: 単一HTMLでフィルタ・検索・詳細表示を実現（GitHub Pagesとの相性が良い）
- **レスポンシブ対応**: モバイルでも閲覧可能

### なぜフレームワークを使わないか

- データセット数は数十〜数百件（JSONで十分扱える規模）
- 依存ゼロでビルドパイプラインがシンプル
- 既存の `yaml` パッケージと `src/types.ts` をビルドスクリプトで再利用可能

---

## 機能要件

### メインビュー（一覧）
- カテゴリ別タブ or フィルタ（government / international / private / academic）
- テキスト検索（名前・説明・タグを対象）
- カード形式でデータセット一覧表示
- 各カードに: ソース名、データセット名、説明（truncate）、タグ、アクセス方法バッジ

### 詳細ビュー
- データセットの全情報表示
- ソース情報（提供元、URL、API有無、フォーマット）
- 外部リンク（ソースURL、データセットURL）

### 統計ダッシュボード（ヘッダー）
- 総ソース数、総データセット数、カテゴリ別件数

---

## ディレクトリ構成

```
gather_data/
├── site/                        # Webサイトソース（新規）
│   ├── index.html               # メインHTML
│   ├── style.css                # スタイルシート
│   └── app.js                   # クライアントサイドJS
├── src/
│   └── build-site.ts            # ビルドスクリプト（新規）
├── dist/                        # ビルド出力（.gitignore済み）
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── catalog.json             # YAML→JSON変換データ
└── .github/
    └── workflows/
        └── deploy.yml           # GitHub Pages デプロイ
```

---

## 実装ステップ

### Step 1: ビルドスクリプト `src/build-site.ts`

- `sources/**/*.yaml` を全件読み込み
- Zodスキーマ（`src/types.ts`）でバリデーション
- `catalog.json` として `dist/` に出力
- `site/` の静的ファイル（HTML/CSS/JS）を `dist/` にコピー

```bash
npm run build:site   # → dist/ に静的サイト生成
```

### Step 2: 静的サイト `site/`

#### `site/index.html`
- セマンティックHTML構造
- ヘッダー: プロジェクト名 + 統計サマリー
- フィルタバー: カテゴリフィルタ + 検索ボックス
- カードグリッド: データセット一覧
- モーダル or 詳細パネル: データセット詳細

#### `site/style.css`
- CSS Grid / Flexbox によるレスポンシブレイアウト
- カテゴリ別の色分け
- ダークモード対応（`prefers-color-scheme`）

#### `site/app.js`
- `catalog.json` をfetchして描画
- クライアントサイド検索（名前・説明・タグをフィルタ）
- カテゴリフィルタ
- 詳細モーダル表示
- URL hash によるステート管理（共有可能なリンク）

### Step 3: package.json にスクリプト追加

```json
{
  "scripts": {
    "build:site": "tsx src/build-site.ts",
    "preview": "npx serve dist"
  }
}
```

### Step 4: GitHub Actions ワークフロー

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build:site
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## catalog.json のスキーマ

```typescript
// ビルド時に生成されるJSONの構造
interface CatalogData {
  generatedAt: string;           // ISO日付
  stats: {
    totalSources: number;
    totalDatasets: number;
    byCategory: Record<string, number>;
  };
  sources: Array<{
    id: string;
    name: string;
    url: string;
    description: string;
    provider: string;
    category: string;
    formats: string[];
    api?: {
      available: boolean;
      base_url?: string;
      docs_url?: string;
    };
    datasets: Array<{
      id: string;
      name: string;
      description: string;
      tags: string[];
      url: string;
      update_frequency?: string;
      last_confirmed: string;
      access_method: string;
      notes?: string;
    }>;
  }>;
}
```

---

## デザイン方針

- **カラーパレット**: カテゴリ別に色を割り当て
  - government: 青系（`#2563eb`）
  - international: 緑系（`#059669`）
  - private: 紫系（`#7c3aed`）
  - academic: オレンジ系（`#d97706`）
- **タイポグラフィ**: system-ui フォントスタック
- **カードデザイン**: 角丸 + 軽い影 + ホバーエフェクト
- **アクセシビリティ**: セマンティックHTML、適切なコントラスト比

---

## 実装の優先順位

1. **ビルドスクリプト** (`src/build-site.ts`) — YAML→JSON変換が全体の基盤
2. **HTML/CSS** (`site/index.html`, `site/style.css`) — 構造とスタイル
3. **JS** (`site/app.js`) — インタラクション（検索・フィルタ・詳細表示）
4. **GitHub Actions** (`.github/workflows/deploy.yml`) — 自動デプロイ
5. **改善**: パフォーマンス最適化、OGP設定等
