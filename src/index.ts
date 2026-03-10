import readline from "node:readline";
import { runAgent } from "./agent.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(): void {
  rl.question("\n> ", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed === "exit" || trimmed === "quit") {
      console.log("終了します。");
      rl.close();
      return;
    }

    try {
      console.log("");
      const result = await runAgent(trimmed);
      console.log(`\n${result}`);
    } catch (e) {
      const err = e as Error;
      if (err.message?.includes("API key")) {
        console.error(
          "\n[エラー] ANTHROPIC_API_KEY が設定されていません。\n" +
            "  export ANTHROPIC_API_KEY=sk-ant-..."
        );
      } else {
        console.error(`\n[エラー] ${err.message}`);
      }
    }

    prompt();
  });
}

console.log("=== データカタログ AIエージェント ===");
console.log('データソースを探すクエリを入力してください。(終了: "exit")\n');
prompt();
