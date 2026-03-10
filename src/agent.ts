import Anthropic from "@anthropic-ai/sdk";
import { searchCatalogTool } from "./tools/search-catalog.js";
import { webSearchTool } from "./tools/web-search.js";
import { fetchPageTool } from "./tools/fetch-page.js";
import { registerToCatalogTool } from "./tools/register.js";
import { listCatalogTool } from "./tools/list-catalog.js";

const SYSTEM_PROMPT = `あなたはデータカタログAIエージェントです。
ユーザーの要求に応じて、データソースを検索・発見・登録します。

## 行動指針

1. まず search_catalog でローカルカタログを検索する
2. カタログに該当がなければ web_search でWebを検索する
3. 有望な候補が見つかったら fetch_page でページ内容を確認する
4. データソース情報が確認できたら register_to_catalog でカタログに登録する
5. ユーザーに結果をわかりやすく報告する

## 登録時のルール

register_to_catalog に渡すJSONは以下の形式:
{
  "source": {
    "id": "英数字のID",
    "name": "サイト名",
    "url": "サイトURL",
    "description": "サイトの説明",
    "provider": "提供組織",
    "category": "government | international | private | academic",
    "formats": ["csv", "json", ...]
  },
  "datasets": [{
    "id": "英数字のID",
    "name": "データセット名",
    "description": "説明",
    "tags": ["タグ1", "タグ2"],
    "url": "データセットURL",
    "last_confirmed": "${new Date().toISOString().split("T")[0]}",
    "access_method": "api | download | scrape",
    "notes": "補足"
  }]
}

同じソースに複数データセットがある場合は1つのJSONにまとめてください。
既に登録済みのソースに追加する場合も同じsource.idで登録すればマージされます。`;

const tools: Anthropic.Tool[] = [
  {
    name: "search_catalog",
    description:
      "ローカルのデータカタログを検索します。まずこのツールを使ってカタログに既存のデータがないか確認してください。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "検索クエリ（日本語・英語どちらも可）",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_search",
    description:
      "Webを検索してデータソースの候補を探します。カタログに該当がない場合に使ってください。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "検索クエリ",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description:
      "指定URLのページ内容を取得してテキスト化します。データソースの詳細を確認するために使ってください。",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "取得するページのURL",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "register_to_catalog",
    description:
      "データソース情報をカタログに登録します。Web検索やページ取得で確認した情報を構造化して登録してください。",
    input_schema: {
      type: "object" as const,
      properties: {
        entry_json: {
          type: "string",
          description: "CatalogEntry形式のJSON文字列",
        },
      },
      required: ["entry_json"],
    },
  },
  {
    name: "list_catalog",
    description:
      "カタログに登録されているデータソースの一覧と統計を表示します。",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          description:
            "フィルター（ソースID、カテゴリ名、サイト名で絞り込み。省略可）",
        },
      },
      required: [],
    },
  },
];

/** ツールの実行 */
async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "search_catalog":
      return searchCatalogTool(input.query as string);
    case "web_search":
      return await webSearchTool(input.query as string);
    case "fetch_page":
      return await fetchPageTool(input.url as string);
    case "register_to_catalog":
      return registerToCatalogTool(input.entry_json as string);
    case "list_catalog":
      return listCatalogTool(input.filter as string | undefined);
    default:
      return `未知のツール: ${name}`;
  }
}

export async function runAgent(userMessage: string): Promise<string> {
  const client = new Anthropic();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // エージェントループ: tool_useがなくなるまで繰り返す
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // テキスト部分を収集
    const textParts = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text);

    // tool_useがなければ最終回答を返す
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      return textParts.join("\n");
    }

    // ツールを実行
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`  🔧 ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 80)}...)`);
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }
}
