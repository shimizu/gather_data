import { loadCatalog, catalogStats } from "../catalog.js";

/** カタログの一覧・統計を表示する */
export function listCatalogTool(filter?: string): string {
  const entries = loadCatalog();

  if (entries.length === 0) {
    return "カタログは空です。まだデータソースが登録されていません。";
  }

  const stats = catalogStats(entries);
  let output = `カタログ統計: ${stats.sources} ソース, ${stats.datasets} データセット\n`;
  output += `カテゴリ: ${Object.entries(stats.categories)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ")}\n\n`;

  for (const entry of entries) {
    // フィルターがあればソースIDまたはカテゴリでフィルタ
    if (
      filter &&
      !entry.source.id.includes(filter) &&
      !entry.source.category.includes(filter) &&
      !entry.source.name.toLowerCase().includes(filter.toLowerCase())
    ) {
      continue;
    }

    output += `■ ${entry.source.name} (${entry.source.id})\n`;
    output += `  カテゴリ: ${entry.source.category} | 提供: ${entry.source.provider}\n`;
    output += `  URL: ${entry.source.url}\n`;
    output += `  データセット:\n`;

    for (const ds of entry.datasets) {
      output += `    - ${ds.name} [${ds.access_method}] タグ: ${ds.tags.join(", ")}\n`;
    }
    output += "\n";
  }

  return output;
}
