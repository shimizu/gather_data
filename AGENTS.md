# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the TypeScript application code: `index.ts` starts the interactive CLI, `agent.ts` coordinates tool use, `catalog.ts` handles YAML and SQLite catalog storage, `db.ts` manages the database, and `src/tools/` holds focused tool modules such as `search-catalog.ts` and `web-search.ts`. `sources/` stores the human-edited catalog as YAML, grouped by provider class (`government/`, `international/`, `private/`, `academic/`). `tests/` contains Vitest coverage for catalog behavior. Longer design notes live in `docs/`.

## Build, Test, and Development Commands
Run `npm install` once to install dependencies. Use `npm start` to launch the CLI; startup rebuilds the SQLite index from YAML. Use `npm run build:catalog` after manual edits under `sources/` when you want to rebuild the index without starting the app. Run `npm test` for the Vitest suite and `npm run typecheck` for strict TypeScript validation.

## Coding Style & Naming Conventions
This project uses ESM TypeScript with `strict` mode enabled. Keep imports in `.js` form inside TypeScript files, matching the existing source. Use 2-space indentation only if a file already uses it; otherwise preserve the repository’s current 2-space/4-space formatting exactly as found in the surrounding code. Prefer descriptive camelCase for functions, PascalCase for types, kebab-case for tool files in `src/tools/`, and snake_case for YAML filenames in `sources/`. Reuse Zod schemas in `src/types.ts` as the source of truth for catalog shapes.

## Testing Guidelines
Tests use Vitest and currently focus on catalog search, registration, and source lookup. Add new tests in `tests/*.test.ts`. Use `initDb(":memory:")` in tests and pass `{ skipYaml: true }` to `registerEntry()` so test runs do not write YAML files. Cover both successful lookups and empty-result paths when changing search or registration logic.

## Commit & Pull Request Guidelines
Recent history mixes short Japanese summaries with conventional prefixes such as `fix:` and `docs:`. Keep commits short, imperative, and scoped to one change, for example `fix: avoid YAML writes in tests` or `docs: clarify catalog rebuild flow`. Pull requests should explain the behavior change, list commands run (`npm test`, `npm run typecheck`), and call out any schema or YAML format changes. Include terminal output or screenshots only when CLI behavior changes materially.

## Security & Configuration Tips
Set `ANTHROPIC_API_KEY` before running the CLI. Do not commit `catalog.db` or secrets. When updating catalog fields, keep `src/types.ts`, database mappings, and any agent prompt assumptions in sync.

## Agent-Specific Instructions
Developer-facing responses for this repository should be written in Japanese. Keep status updates, review comments, and implementation notes concise and action-oriented.
