/**
 * 対話型CLIのエントリポイント。
 *
 * 起動時に YAML → SQLite インデックスを再構築してから、
 * readline で対話ループに入る。
 *
 * 実行: npm start (= tsx src/index.ts)
 */
import readline from "node:readline";
import { runAgent } from "./agent.js";
import { rebuildIndex } from "./catalog.js";
import { closeDb } from "./db.js";

// 起動時にYAMLからSQLiteインデックスを構築。
// これにより、前回終了後にYAMLを手動編集した変更も反映される。
const stats = rebuildIndex();
console.log("=== データカタログ AIエージェント ===");
console.log(`カタログ読み込み完了: ${stats.sources} ソース, ${stats.datasets} データセット`);
console.log('データソースを探すクエリを入力してください。(終了: "exit")\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/** 対話ループ。再帰的に自身を呼び出してプロンプトを継続する */
function prompt(): void {
  rl.question("> ", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed === "exit" || trimmed === "quit") {
      console.log("終了します。");
      closeDb();
      rl.close();
      return;
    }

    try {
      console.log("");
      const result = await runAgent(trimmed);
      console.log(`\n${result}\n`);
    } catch (e) {
      const err = e as Error;
      // APIキー未設定は専用メッセージで案内
      if (err.message?.includes("API key")) {
        console.error(
          "\n[エラー] ANTHROPIC_API_KEY が設定されていません。\n" +
            "  export ANTHROPIC_API_KEY=sk-ant-...\n"
        );
      } else {
        console.error(`\n[エラー] ${err.message}\n`);
      }
    }

    prompt();
  });
}

prompt();
