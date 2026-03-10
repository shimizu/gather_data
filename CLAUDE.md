# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Claude API の tool use を活用した **AIエージェント型データカタログ CLI**。対話形式でデータソースを検索・登録・管理する。YAML（マスターデータ/Git管理）と SQLite/FTS5（検索インデックス/自動生成）のデュアルストレージ設計。

## コマンド

```bash
npm install            # 依存パッケージインストール
npm start              # 対話型CLI起動（起動時にYAML→SQLite再構築）
npm run build:catalog  # YAML→SQLite手動再構築
npm test               # Vitestテスト実行
npm run typecheck      # TypeScript型チェック（strict mode）
```

## アーキテクチャ

- **CLI層**: `src/index.ts` — readline対話ループ、起動時にSQLiteインデックス再構築
- **エージェント層**: `src/agent.ts` — Claude API (claude-sonnet-4-20250514) + tool useループ
- **ツール群**: `src/tools/` — search-catalog, web-search, fetch-page, register, catalog-stats, get-source-detail
- **データ層**: `src/catalog.ts`（CRUD/FTS5検索/YAML-SQLite同期）、`src/db.ts`（SQLite初期化/マイグレーション）
- **型定義**: `src/types.ts` — Zodスキーマが Single Source of Truth。DB・エージェント・カタログすべてと同期必須

### デュアルストレージ

| | YAML (`sources/`) | SQLite (`catalog.db`) |
|---|---|---|
| 役割 | マスターデータ | 検索インデックス |
| Git管理 | Yes | No (.gitignore) |
| 書き込み | `registerEntry()` | UPSERT |

カテゴリ: `government/`, `international/`, `private/`, `academic/`

## コーディング規約

- ESM TypeScript (strict)、インポートは `.js` 拡張子
- 2スペースインデント
- 関数: camelCase、型: PascalCase、ツールファイル: kebab-case、YAMLファイル: snake_case
- `src/types.ts` のZodスキーマを変更したらDBマッピング・エージェントプロンプトも同期

## テスト

- Vitest使用、`globals: true` 設定済み
- テスト内では `initDb(":memory:")` + `{ skipYaml: true }` でYAMLファイル生成を防止
- 成功パスと空結果パスの両方をカバーすること

## 環境変数

- `ANTHROPIC_API_KEY` — CLI実行に必須

## 日本語対応

- 開発者向け応答・コミットメッセージは日本語で記述
- FTS5は `tokenize='unicode61'` で日本語検索に対応
