/**
 * カタログ検索ツール。
 * エージェントが最初に呼ぶツール。ローカルカタログをFTS5で検索する。
 * 該当なしの場合は「Web検索を試してください」と返し、エージェントに次の行動を促す。
 */
import { searchCatalog } from "../catalog.js";

export function searchCatalogTool(query: string, limit = 10): string {
  const results = searchCatalog(query, limit);

  if (results.length === 0) {
    return `カタログに「${query}」に該当するデータセットはありませんでした。Web検索を試してください。`;
  }

  // LLM が解釈しやすいテキスト形式で返す
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
