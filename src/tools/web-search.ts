/** Web検索ツール: 指定クエリでデータソースを検索する */
export async function webSearchTool(query: string): Promise<string> {
  const searchQuery = `${query} データセット オープンデータ`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return `Web検索に失敗しました (HTTP ${res.status})。クエリ: ${searchQuery}`;
    }

    const html = await res.text();
    const snippets = extractSnippets(html);

    if (snippets.length === 0) {
      return `「${searchQuery}」の検索結果からスニペットを抽出できませんでした。fetch_page ツールで直接データポータルを確認してください。`;
    }

    return `「${searchQuery}」の検索結果:\n\n${snippets.join("\n\n")}`;
  } catch (e) {
    return `Web検索でエラーが発生しました: ${(e as Error).message}`;
  }
}

/** HTMLからテキストスニペットを簡易抽出 */
function extractSnippets(html: string): string[] {
  const snippets: string[] = [];

  // <a href="...">のURLとテキストを抽出
  const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>(.*?)<\/a>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null && snippets.length < 10) {
    const url = decodeURIComponent(match[1]);
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (
      text &&
      url.startsWith("http") &&
      !url.includes("google.com") &&
      !url.includes("youtube.com")
    ) {
      snippets.push(`- ${text}\n  URL: ${url}`);
    }
  }

  return snippets;
}
