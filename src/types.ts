/**
 * データカタログの型定義とバリデーションスキーマ。
 *
 * Zodスキーマが信頼できる唯一の情報源 (Single Source of Truth)。
 * YAMLの読み込み時とエージェントからの登録時にバリデーションに使われる。
 *
 * スキーマを変更する場合は、以下も合わせて更新すること:
 *   - db.ts の CREATE TABLE 文
 *   - catalog.ts の INSERT/SELECT マッピング
 *   - agent.ts のシステムプロンプト内の登録フォーマット説明
 */
import { z } from "zod";

// --- Source (サイト情報) ---

/** API認証情報。key_env には環境変数名を指定する (例: "ESTAT_API_KEY") */
const ApiAuthSchema = z.object({
  type: z.enum(["api_key", "oauth", "none"]),
  key_env: z.string().optional(),
});

/** データソースが提供するAPIの情報 */
const ApiSchema = z.object({
  available: z.boolean(),
  base_url: z.string().optional(),
  auth: ApiAuthSchema.optional(),
  docs_url: z.string().optional(),
});

/**
 * データソース (Webサイト/データプロバイダ) のスキーマ。
 * 1つのYAMLファイルに1つのソースが対応する。
 * category を追加する場合は db.ts の CHECK 制約も更新すること。
 */
const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string(),
  provider: z.string(),
  category: z.enum(["government", "international", "private", "academic"]),
  api: ApiSchema.optional(),
  formats: z.array(z.string()),
});

/**
 * 個別データセットのスキーマ。
 * 1つのソースに複数のデータセットが紐づく。
 * tags はFTS5の全文検索インデックスに登録される。
 */
const DatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  url: z.string(),
  update_frequency: z.string().optional(),
  last_confirmed: z.string(),
  access_method: z.enum(["api", "download", "scrape"]),
  notes: z.string().optional(),
});

/**
 * カタログエントリ = 1つのYAMLファイルに対応する単位。
 * source (サイト情報) + datasets (データセット群) の2層構造。
 */
export const CatalogEntrySchema = z.object({
  source: SourceSchema,
  datasets: z.array(DatasetSchema),
});

// Zodスキーマから TypeScript 型を推論
export type Source = z.infer<typeof SourceSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

/** FTS5検索の結果。score は旧キーワード検索時代の名残で、現在は rank を使用 */
export interface SearchResult {
  source: Source;
  dataset: Dataset;
  score: number;
}
