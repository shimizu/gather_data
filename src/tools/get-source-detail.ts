import { getSourceDetail } from "../catalog.js";

/** 特定ソースの詳細情報を返す */
export function getSourceDetailTool(sourceId: string): string {
  const detail = getSourceDetail(sourceId);

  if (!detail) {
    return `ソース "${sourceId}" は見つかりませんでした。`;
  }

  const s = detail.source;
  let output = `■ ${s.name} (${s.id})\n`;
  output += `  カテゴリ: ${s.category}\n`;
  output += `  提供: ${s.provider}\n`;
  output += `  URL: ${s.url}\n`;
  output += `  説明: ${s.description}\n`;
  output += `  フォーマット: ${s.formats.join(", ")}\n`;

  if (s.api) {
    output += `  API: ${s.api.available ? "あり" : "なし"}`;
    if (s.api.base_url) output += ` (${s.api.base_url})`;
    if (s.api.auth?.type) output += ` [認証: ${s.api.auth.type}]`;
    output += "\n";
    if (s.api.docs_url) output += `  APIドキュメント: ${s.api.docs_url}\n`;
  }

  output += `\n  データセット (${detail.datasets.length} 件):\n`;
  for (const d of detail.datasets) {
    output += `    - ${d.name}\n`;
    output += `      タグ: ${d.tags.join(", ")}\n`;
    output += `      取得方法: ${d.access_method}\n`;
    output += `      URL: ${d.url}\n`;
    if (d.notes) output += `      備考: ${d.notes.trim()}\n`;
  }

  return output;
}
