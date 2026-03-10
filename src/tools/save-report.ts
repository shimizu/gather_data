/**
 * レポートファイル出力ツール。
 * エージェントが調査した結果をMarkdownファイルとして out/ ディレクトリに保存する。
 * ファイル名にはタイムスタンプを付与して一意にする。
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(import.meta.dirname, "../../out");

export function saveReportTool(title: string, content: string): string {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `${timestamp}_${title.replace(/[^a-zA-Z0-9\u3000-\u9FFF\u4E00-\u9FFF_-]/g, "_").slice(0, 80)}.md`;
  const filePath = path.join(OUT_DIR, fileName);

  fs.writeFileSync(filePath, content, "utf-8");

  return `レポートを保存しました: ${filePath}`;
}
