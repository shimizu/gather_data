import { loadCatalog, searchCatalog } from "../catalog.js";
import type { SearchResult } from "../types.js";

export function searchCatalogTool(query: string): string {
  const entries = loadCatalog();

  if (entries.length === 0) {
    return "カタログは空です。Web検索でデータソースを探してください。";
  }

  const results = searchCatalog(entries, query);

  if (results.length === 0) {
    return `カタログに「${query}」に該当するデータセットはありませんでした。Web検索を試してください。`;
  }

  return formatResults(results.slice(0, 10));
}

function formatResults(results: SearchResult[]): string {
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.dataset.name} (${r.source.name})\n` +
        `    タグ: ${r.dataset.tags.join(", ")}\n` +
        `    取得方法: ${r.dataset.access_method}\n` +
        `    URL: ${r.dataset.url}\n` +
        (r.dataset.notes ? `    備考: ${r.dataset.notes.trim()}\n` : "")
    )
    .join("\n");
}
