import { z } from "zod";

// --- Source (サイト情報) ---

const ApiAuthSchema = z.object({
  type: z.enum(["api_key", "oauth", "none"]),
  key_env: z.string().optional(),
});

const ApiSchema = z.object({
  available: z.boolean(),
  base_url: z.string().optional(),
  auth: ApiAuthSchema.optional(),
  docs_url: z.string().optional(),
});

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

// --- Dataset (データセット情報) ---

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

// --- CatalogEntry (1つのYAMLファイル) ---

export const CatalogEntrySchema = z.object({
  source: SourceSchema,
  datasets: z.array(DatasetSchema),
});

export type Source = z.infer<typeof SourceSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

// --- 検索結果 ---

export interface SearchResult {
  source: Source;
  dataset: Dataset;
  score: number;
}
