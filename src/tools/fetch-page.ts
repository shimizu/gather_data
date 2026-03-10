/** 指定URLのページ内容を取得してテキスト化する */
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

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return `HTMLではないコンテンツ (${contentType}): ${url}`;
    }

    const html = await res.text();
    const text = htmlToText(html);

    // 長すぎる場合は先頭を切り出す
    const maxLength = 8000;
    if (text.length > maxLength) {
      return `${url} の内容 (先頭${maxLength}文字):\n\n${text.slice(0, maxLength)}...`;
    }

    return `${url} の内容:\n\n${text}`;
  } catch (e) {
    return `ページ取得でエラー: ${(e as Error).message} (${url})`;
  }
}

/** HTMLからテキストを抽出 (簡易版) */
function htmlToText(html: string): string {
  return (
    html
      // script, style タグを除去
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      // HTMLタグを除去
      .replace(/<[^>]+>/g, " ")
      // HTMLエンティティをデコード
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
