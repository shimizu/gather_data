/**
 * ページ取得ツール。
 * 指定URLのHTML内容を取得し、テキストに変換して返す。
 * エージェントがWeb検索で見つけた候補ページの内容を確認するために使う。
 *
 * 制限事項:
 *   - 15秒のタイムアウト
 *   - text/html と text/plain のみ対応 (PDF等は非対応)
 *   - 8000文字で切り詰め (LLMのコンテキスト節約)
 *   - JavaScript レンダリングが必要なSPAには非対応
 */
export async function fetchPageTool(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return `ページ取得失敗 (HTTP ${res.status}): ${url}`;
    }

    // バイナリコンテンツ (PDF, 画像等) はスキップ
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return `HTMLではないコンテンツ (${contentType}): ${url}`;
    }

    const html = await res.text();
    const text = htmlToText(html);

    // LLMのコンテキストを圧迫しないよう先頭8000文字で打ち切る
    const maxLength = 8000;
    if (text.length > maxLength) {
      return `${url} の内容 (先頭${maxLength}文字):\n\n${text.slice(0, maxLength)}...`;
    }

    return `${url} の内容:\n\n${text}`;
  } catch (e) {
    return `ページ取得でエラー: ${(e as Error).message} (${url})`;
  }
}

/**
 * HTMLからテキストを抽出する簡易パーサー。
 * ナビゲーション等のノイズ要素を除去してからタグを剥がす。
 * 本格的なHTML→テキスト変換が必要なら cheerio 等の導入を検討。
 */
function htmlToText(html: string): string {
  return (
    html
      // ノイズの多い要素を丸ごと除去
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      // 残りのHTMLタグを除去
      .replace(/<[^>]+>/g, " ")
      // よく使われるHTMLエンティティをデコード
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // 連続空白を整理
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim()
  );
}
