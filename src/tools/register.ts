/**
 * カタログ登録ツール。
 * エージェントがWeb検索で発見した情報を構造化してカタログに登録する。
 *
 * 入力は CatalogEntry 形式のJSON文字列。
 * Zodでバリデーションしてから catalog.registerEntry() で SQLite + YAML に同時書き込みする。
 * バリデーションエラー時はエラーメッセージを返し、LLMに再試行を促す。
 */
import { CatalogEntrySchema } from "../types.js";
import { registerEntry } from "../catalog.js";

export function registerToCatalogTool(entryJson: string): string {
  try {
    const data = JSON.parse(entryJson);
    const result = CatalogEntrySchema.safeParse(data);

    if (!result.success) {
      return `バリデーションエラー: ${result.error.message}\n\n正しいフォーマットで再度登録してください。`;
    }

    const message = registerEntry(result.data);
    return `カタログに登録しました: ${message}`;
  } catch (e) {
    return `JSONパースエラー: ${(e as Error).message}`;
  }
}
