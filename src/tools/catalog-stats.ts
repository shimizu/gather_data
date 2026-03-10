/**
 * カタログ統計ツール。
 * ソース数、データセット数、カテゴリ別内訳のサマリーを返す。
 *
 * 旧 list_catalog ツールの代替。全件返すとLLMのコンテキストを圧迫するため、
 * 統計サマリーのみ返すように分離された。
 * 個別ソースの詳細は get_source_detail ツールで取得する。
 */
import { getCatalogStats } from "../catalog.js";

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
