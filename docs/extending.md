# 拡張ガイド

## 新しいツールの追加

### 1. ツール関数を実装

`src/tools/` にファイルを作成:

```typescript
// src/tools/download-data.ts
export async function downloadDataTool(sourceId: string, datasetId: string): Promise<string> {
  // 実装...
  return "ダウンロード結果";
}
```

### 2. agent.ts にツール定義を追加

`tools` 配列に定義を追加:

```typescript
{
  name: "download_data",
  description: "カタログに登録されたデータを実際にダウンロードします。",
  input_schema: {
    type: "object" as const,
    properties: {
      source_id: { type: "string", description: "ソースID" },
      dataset_id: { type: "string", description: "データセットID" },
    },
    required: ["source_id", "dataset_id"],
  },
},
```

### 3. executeTool に分岐を追加

```typescript
case "download_data":
  return await downloadDataTool(
    input.source_id as string,
    input.dataset_id as string
  );
```

### 4. システムプロンプトを更新 (必要に応じて)

新しいツールの使い方をLLMに伝えるため、`SYSTEM_PROMPT` に説明を追加する。

## カテゴリの追加

### 1. types.ts の enum を更新

```typescript
category: z.enum(["government", "international", "private", "academic", "新カテゴリ"]),
```

### 2. db.ts の CHECK 制約を更新

```sql
category TEXT NOT NULL CHECK(category IN ('government','international','private','academic','新カテゴリ'))
```

### 3. sources/ にディレクトリを作成

```bash
mkdir sources/新カテゴリ
```

### 4. 既存DBを再構築

```bash
rm catalog.db
npm run build:catalog
```

**注意**: カテゴリを変更して `registerEntry()` で再登録した場合、旧カテゴリの YAML は自動削除される。手動で YAML を移動する必要はない。

## スキーマの変更

### dataset にフィールドを追加する例

#### 1. types.ts

```typescript
const DatasetSchema = z.object({
  // ...既存フィールド
  license: z.string().optional(),  // 追加
});
```

#### 2. db.ts

```sql
CREATE TABLE IF NOT EXISTS datasets (
  -- ...既存カラム
  license TEXT,  -- 追加
  -- ...
);
```

**注意**: 既存の catalog.db がある場合は `ALTER TABLE` か、DB削除+再構築が必要。

```bash
rm catalog.db
npm run build:catalog
```

#### 3. catalog.ts

INSERT/SELECT のマッピングに新フィールドを追加する。

#### 4. agent.ts

システムプロンプト内の登録フォーマット説明を更新する。

## Web検索の改善

現在の `web-search.ts` は Google にHTTPリクエストを送ってHTMLをパースしている。
より安定した検索を行うには、以下の方法がある:

### Google Custom Search API

```typescript
const API_KEY = process.env.GOOGLE_API_KEY;
const CX = process.env.GOOGLE_CX;
const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${query}`;
const res = await fetch(url);
const data = await res.json();
// data.items[].title, data.items[].link, data.items[].snippet
```

### SerpAPI

```typescript
const API_KEY = process.env.SERPAPI_KEY;
const url = `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${API_KEY}`;
```

いずれも構造化されたJSONが返るため、HTMLパースより信頼性が高い。

## MCP Server 化

このプロジェクトをMCP Serverとして公開すると、Claude Code や Claude Desktop から直接呼べるようになる。

### 概要

```
Claude Code / Claude Desktop
  └─ MCP プロトコル
       └─ gather-data MCP Server
            ├─ search_catalog
            ├─ register_to_catalog
            ├─ catalog_stats
            └─ get_source_detail
```

### 実装方針

1. `@modelcontextprotocol/sdk` を依存に追加
2. `src/mcp-server.ts` を作成し、既存のツール関数をMCPツールとして公開
3. `claude_desktop_config.json` にサーバー設定を追加

既存のツール関数 (`searchCatalogTool` 等) はそのまま再利用できる。
エージェントループ (`agent.ts`) は不要で、ツール関数だけを公開する形になる。

## ベクトル検索の追加 (将来)

FTS5のキーワード検索に加えて、Embeddingベースのセマンティック検索を追加できる。

### 選択肢

- **sqlite-vss**: SQLite拡張。既存のSQLiteに統合可能
- **ChromaDB**: 外部プロセスが必要だが機能が豊富

### 実装方針

1. データセットの `name + description + tags` を結合してEmbedding化
2. ベクトルをSQLiteまたは外部DBに保存
3. `search_catalog` を拡張し、FTS5 + ベクトル検索のハイブリッドにする
4. 「経済の動向を分析したい」のような意味的なクエリに対応

## 定期巡回 (将来)

カタログに登録されたURLが生きているか定期的にチェックする機能。

### 実装方針

1. `datasets` テーブルに `last_checked`, `status` カラムを追加
2. 全URLにHEADリクエストを送り、HTTP ステータスを確認
3. 404 や接続エラーのデータセットをレポート
4. cron や GitHub Actions で定期実行
