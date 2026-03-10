/**
 * Web検索ツール。
 *
 * Google にHTTPリクエストを送り、検索結果HTMLからリンクとスニペットを抽出する。
 * クエリには自動で「データセット オープンデータ」を付加してデータソースに特化した結果を得る。
 *
 * 制限事項:
 *   - Google のHTML構造に依存しているため、変更されると抽出が壊れる可能性がある
 *   - レート制限やブロックを受ける場合がある
 *   - より安定した検索が必要なら Google Custom Search API や SerpAPI への置き換えを推奨
 */
export async function webSearchTool(query: string): Promise<string> {
  // データソース検索に特化するためのクエリ拡張
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

/**
 * Google検索結果のHTMLからリンクとテキストを簡易抽出する。
 * Google は /url?q=実URL の形式でリダイレクトリンクを生成するため、そのパターンにマッチさせる。
 * google.com, youtube.com のリンクは除外し、最大10件まで抽出する。
 */
function extractSnippets(html: string): string[] {
  const snippets: string[] = [];

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
