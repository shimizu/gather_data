import { CatalogEntrySchema } from "../types.js";
import { registerEntry } from "../catalog.js";

/**
 * データソース情報をカタログに登録する (SQLite + YAML 同時書き込み)
 */
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
