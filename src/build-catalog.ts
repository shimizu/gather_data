/**
 * YAML → SQLite インデックスの手動再構築スクリプト。
 *
 * YAMLを手動で編集・追加した後に実行する。
 * 実行: npm run build:catalog
 */
import { rebuildIndex } from "./catalog.js";
import { closeDb } from "./db.js";

console.log("YAML → SQLite インデックスを再構築中...");
const stats = rebuildIndex();
console.log(`完了: ${stats.sources} ソース, ${stats.datasets} データセット`);
closeDb();
