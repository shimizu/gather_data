import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { CatalogEntrySchema } from "./types.js";
import type { CatalogEntry, SearchResult } from "./types.js";

const SOURCES_DIR = path.resolve(import.meta.dirname, "../sources");

/** sources/ 以下の全YAMLを読み込む */
export function loadCatalog(): CatalogEntry[] {
  if (!fs.existsSync(SOURCES_DIR)) {
    fs.mkdirSync(SOURCES_DIR, { recursive: true });
    return [];
  }

  const files = fs
    .readdirSync(SOURCES_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  const entries: CatalogEntry[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(SOURCES_DIR, file), "utf-8");
    const data = parse(content);
    const result = CatalogEntrySchema.safeParse(data);
    if (result.success) {
      entries.push(result.data);
    } else {
      console.error(`[WARN] ${file} のパースに失敗: ${result.error.message}`);
    }
  }
  return entries;
}

/** カタログをキーワード検索する */
export function searchCatalog(
  entries: CatalogEntry[],
  query: string
): SearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) return [];

  const results: SearchResult[] = [];

  for (const entry of entries) {
    for (const dataset of entry.datasets) {
      let score = 0;

      for (const term of terms) {
        // タグの完全一致 (重みを高く)
        if (dataset.tags.some((tag) => tag.toLowerCase() === term)) {
          score += 10;
        }
        // タグの部分一致
        else if (dataset.tags.some((tag) => tag.toLowerCase().includes(term))) {
          score += 5;
        }

        // 名前に含まれる
        if (dataset.name.toLowerCase().includes(term)) {
          score += 8;
        }

        // 説明に含まれる
        if (dataset.description.toLowerCase().includes(term)) {
          score += 3;
        }

        // ソース名に含まれる
        if (entry.source.name.toLowerCase().includes(term)) {
          score += 2;
        }
      }

      if (score > 0) {
        results.push({ source: entry.source, dataset, score });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/** 新しいエントリをカタログに保存する */
export function saveCatalogEntry(entry: CatalogEntry): string {
  if (!fs.existsSync(SOURCES_DIR)) {
    fs.mkdirSync(SOURCES_DIR, { recursive: true });
  }

  const filePath = path.join(SOURCES_DIR, `${entry.source.id}.yaml`);

  // 既存ファイルがある場合はデータセットをマージ
  if (fs.existsSync(filePath)) {
    const existing = parse(
      fs.readFileSync(filePath, "utf-8")
    ) as CatalogEntry;
    const existingIds = new Set(existing.datasets.map((d) => d.id));
    const newDatasets = entry.datasets.filter((d) => !existingIds.has(d.id));
    existing.datasets.push(...newDatasets);
    fs.writeFileSync(filePath, stringify(existing), "utf-8");
    return `${filePath} に ${newDatasets.length} 件追加 (既存: ${existingIds.size} 件)`;
  }

  fs.writeFileSync(filePath, stringify(entry), "utf-8");
  return `${filePath} を新規作成 (${entry.datasets.length} 件)`;
}

/** カタログの統計情報 */
export function catalogStats(entries: CatalogEntry[]) {
  const totalDatasets = entries.reduce(
    (sum, e) => sum + e.datasets.length,
    0
  );
  const categories = entries.reduce(
    (acc, e) => {
      acc[e.source.category] = (acc[e.source.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    sources: entries.length,
    datasets: totalDatasets,
    categories,
  };
}
