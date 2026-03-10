import { rebuildIndex } from "./catalog.js";
import { closeDb } from "./db.js";

console.log("YAML → SQLite インデックスを再構築中...");
const stats = rebuildIndex();
console.log(`完了: ${stats.sources} ソース, ${stats.datasets} データセット`);
closeDb();
