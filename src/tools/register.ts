import { CatalogEntrySchema } from "../types.js";
import { saveCatalogEntry } from "../catalog.js";

/**
 * データソース情報をカタログに登録する。
 * LLMがWeb検索結果から構造化した情報をJSON文字列で渡す。
 */
export function registerToCatalogTool(entryJson: string): string {
  try {
    const data = JSON.parse(entryJson);
    const result = CatalogEntrySchema.safeParse(data);

    if (!result.success) {
      return `バリデーションエラー: ${result.error.message}\n\n正しいフォーマットで再度登録してください。`;
    }

    const message = saveCatalogEntry(result.data);
    return `カタログに登録しました: ${message}`;
  } catch (e) {
    return `JSONパースエラー: ${(e as Error).message}`;
  }
}
