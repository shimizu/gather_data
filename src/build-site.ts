// 静的サイトビルドスクリプト。
// sources/ 以下の YAML を読み込み catalog.json を生成し、
// site/ の静的ファイルと共に dist/ へ出力する。
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { CatalogEntrySchema } from "./types.js";
import type { CatalogEntry } from "./types.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCES_DIR = path.join(ROOT, "sources");
const SITE_DIR = path.join(ROOT, "site");
const DIST_DIR = path.join(ROOT, "dist");

/** YAML を再帰的に読み込む */
function loadAllYaml(): CatalogEntry[] {
  if (!fs.existsSync(SOURCES_DIR)) return [];
  const entries: CatalogEntry[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const data = parse(content);
          const result = CatalogEntrySchema.safeParse(data);
          if (result.success) {
            entries.push(result.data);
          } else {
            console.error(`[WARN] ${fullPath}: バリデーション失敗`);
          }
        } catch {
          console.error(`[WARN] ${fullPath}: 読み込み失敗`);
        }
      }
    }
  }

  walk(SOURCES_DIR);
  return entries;
}

/** catalog.json 用のデータを構築 */
function buildCatalogJson(entries: CatalogEntry[]) {
  const byCategory: Record<string, number> = {};
  let totalDatasets = 0;

  for (const e of entries) {
    byCategory[e.source.category] = (byCategory[e.source.category] ?? 0) + 1;
    totalDatasets += e.datasets.length;
  }

  // API の auth 情報（key_env 等）はフロントに出さない
  const sources = entries.map((e) => ({
    id: e.source.id,
    name: e.source.name,
    url: e.source.url,
    description: e.source.description,
    provider: e.source.provider,
    category: e.source.category,
    formats: e.source.formats,
    api: e.source.api
      ? { available: e.source.api.available, docs_url: e.source.api.docs_url }
      : undefined,
    datasets: e.datasets.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      tags: d.tags,
      url: d.url,
      update_frequency: d.update_frequency,
      last_confirmed: d.last_confirmed,
      access_method: d.access_method,
      notes: d.notes,
    })),
  }));

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalSources: entries.length,
      totalDatasets,
      byCategory,
    },
    sources,
  };
}

// --- Main ---
console.log("Building site...");

// dist/ をクリーンアップ
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// YAML → catalog.json
const entries = loadAllYaml();
const catalog = buildCatalogJson(entries);
fs.writeFileSync(
  path.join(DIST_DIR, "catalog.json"),
  JSON.stringify(catalog, null, 2),
  "utf-8",
);
console.log(
  `catalog.json: ${catalog.stats.totalSources} sources, ${catalog.stats.totalDatasets} datasets`,
);

// site/ → dist/ にコピー
for (const file of fs.readdirSync(SITE_DIR)) {
  fs.copyFileSync(path.join(SITE_DIR, file), path.join(DIST_DIR, file));
}

console.log("Done! Output: dist/");
