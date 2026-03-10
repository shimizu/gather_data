import { getCatalogStats } from "../catalog.js";

/** カタログの統計サマリーを返す */
export function catalogStatsTool(): string {
  const stats = getCatalogStats();

  if (stats.sources === 0) {
    return "カタログは空です。まだデータソースが登録されていません。";
  }

  let output = `カタログ統計:\n`;
  output += `  ソース数: ${stats.sources}\n`;
  output += `  データセット数: ${stats.datasets}\n`;
  output += `  カテゴリ内訳: ${Object.entries(stats.categories)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ")}`;

  return output;
}
