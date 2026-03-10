# 開発ガイド

## セットアップ

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
```

## コマンド一覧

| コマンド | 用途 |
|---------|------|
| `npm start` | 対話型CLI起動 (起動時にYAML→SQLite再構築) |
| `npm run build:catalog` | YAML→SQLite手動再構築 |
| `npm test` | テスト実行 (Vitest) |
| `npm run typecheck` | TypeScript型チェック |

## コーディング規約

### TypeScript

- `"type": "module"` (ESM)。import には `.js` 拡張子を付ける
- `strict: true`。any は使わない
- Zod スキーマから型推論する (`z.infer<typeof Schema>`)

### ファイル命名

- src/tools/ 以下はケバブケース (`search-catalog.ts`)
- sources/ 以下はスネークケース (`data_go_jp.yaml`)

### 関数命名

- ツール関数: `xxxTool()` (例: `searchCatalogTool()`)
- カタログ操作: 動詞始まり (例: `registerEntry()`, `getCatalogStats()`)

## テスト

### 実行

```bash
npm test
```

### テスト方針

- **インメモリDB** (`":memory:"`) を使用。テスト後にファイルが残らない
- `registerEntry(entry, { skipYaml: true })` でYAML書き出しをスキップ
- beforeAll でDB初期化 + テストデータ投入、afterAll で closeDb()

### テスト追加時の注意

```typescript
import { initDb, closeDb } from "../src/db.js";

beforeAll(() => {
  initDb(":memory:");  // 必ずインメモリDBを使う
  // テストデータ投入...
});

afterAll(() => {
  closeDb();
});
```

実ファイルシステムへの書き込みを避けるため、`registerEntry` を呼ぶ際は `{ skipYaml: true }` を必ず指定する。

## 型定義 (types.ts)

Zod スキーマが信頼できる唯一の情報源 (Single Source of Truth)。

```
CatalogEntrySchema
├── source: SourceSchema
│   ├── id, name, url, description, provider
│   ├── category: "government" | "international" | "private" | "academic"
│   ├── api?: ApiSchema
│   │   ├── available: boolean
│   │   ├── base_url?, auth?: ApiAuthSchema, docs_url?
│   │   └── auth.type: "api_key" | "oauth" | "none"
│   └── formats: string[]
└── datasets: DatasetSchema[]
    ├── id, name, description
    ├── tags: string[]
    ├── url, update_frequency?, last_confirmed
    ├── access_method: "api" | "download" | "scrape"
    └── notes?
```

型を変更する場合は、以下を全て更新する:
1. `types.ts` の Zod スキーマ
2. `db.ts` の CREATE TABLE
3. `catalog.ts` の INSERT/SELECT マッピング
4. `agent.ts` のシステムプロンプト内の登録フォーマット説明

## デバッグ

### エージェントのツール呼び出しを確認

`npm start` 実行中、ツール呼び出しがコンソールに表示される:

```
  🔧 search_catalog({"query":"人口"}...)
  🔧 web_search({"query":"人口 統計 データ"}...)
```

### SQLiteの中身を直接確認

```bash
sqlite3 catalog.db
> SELECT COUNT(*) FROM sources;
> SELECT COUNT(*) FROM datasets;
> SELECT * FROM datasets_fts WHERE datasets_fts MATCH '"人口"';
```

### YAML バリデーションエラー

起動時に `[WARN] xxx.yaml のパースに失敗` と表示される場合、
対象YAMLの構造が `CatalogEntrySchema` に合っていない。
`types.ts` のスキーマと突き合わせて修正する。
