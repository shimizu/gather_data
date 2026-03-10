/**
 * カタログの読み書き・検索ロジック。
 *
 * デュアルストレージ設計:
 *   - YAML (sources/**\/*.yaml): マスターデータ。人間が読める形式でGit管理
 *   - SQLite (catalog.db): 検索用インデックス。FTS5で高速全文検索
 *
 * 主要な操作:
 *   - rebuildIndex(): YAML → SQLite 全件再構築 (起動時・手動)
 *   - searchCatalog(): FTS5 で全文検索
 *   - registerEntry(): SQLite + YAML 同時書き込み
 */
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { getDb } from "./db.js";
import { CatalogEntrySchema } from "./types.js";
import type { CatalogEntry, Source, Dataset } from "./types.js";

/** YAMLマスターデータの格納ディレクトリ */
const SOURCES_DIR = path.resolve(import.meta.dirname, "../sources");

// =============================================================================
// YAML読み込み
// =============================================================================

/**
 * sources/ 以下の全YAMLを再帰的に読み込み、Zodでバリデーションして返す。
 * パースに失敗したファイルはスキップされ、警告がコンソールに出力される。
 */
export function loadAllYaml(): CatalogEntry[] {
  if (!fs.existsSync(SOURCES_DIR)) return [];

  const entries: CatalogEntry[] = [];
  walkYamlFiles(SOURCES_DIR, (filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const data = parse(content);
      const result = CatalogEntrySchema.safeParse(data);
      if (result.success) {
        entries.push(result.data);
      } else {
        console.error(`[WARN] ${filePath} のバリデーションに失敗: ${result.error.message}`);
      }
    } catch (e) {
      console.error(`[WARN] ${filePath} の読み込みに失敗 (スキップ): ${(e as Error).message}`);
    }
  });
  return entries;
}

/** ディレクトリを再帰的に走査し、.yaml/.yml ファイルごとにコールバックを呼ぶ */
function walkYamlFiles(dir: string, callback: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkYamlFiles(fullPath, callback);
    } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
      callback(fullPath);
    }
  }
}

/**
 * 指定カテゴリ以外のディレクトリに存在する同一 source.id の YAML を削除する。
 * カテゴリ変更時に旧ファイルが残って rebuildIndex() で重複するのを防ぐ。
 */
function removeStaleYaml(sourceId: string, currentCategory: string): void {
  if (!fs.existsSync(SOURCES_DIR)) return;

  const fileName = `${sourceId}.yaml`;
  for (const entry of fs.readdirSync(SOURCES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === currentCategory) continue;
    const candidate = path.join(SOURCES_DIR, entry.name, fileName);
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
      console.log(`[INFO] カテゴリ変更に伴い旧 YAML を削除: ${candidate}`);
    }
  }
}

// =============================================================================
// SQLiteインデックス再構築
// =============================================================================

/**
 * YAMLマスターデータからSQLiteインデックスを全件再構築する。
 * 既存データを全削除してからトランザクション内で一括挿入する。
 *
 * 呼び出しタイミング:
 *   - アプリ起動時 (index.ts)
 *   - npm run build:catalog (build-catalog.ts)
 */
export function rebuildIndex(): { sources: number; datasets: number } {
  const db = getDb();
  const entries = loadAllYaml();

  // 外部キー制約の順序に注意: FTS → datasets → sources の順で削除
  db.exec("DELETE FROM datasets_fts");
  db.exec("DELETE FROM datasets");
  db.exec("DELETE FROM sources");

  let sourceCount = 0;
  let datasetCount = 0;

  const insertSource = db.prepare(`
    INSERT OR REPLACE INTO sources (id, name, url, description, provider, category, api_json, formats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDataset = db.prepare(`
    INSERT OR REPLACE INTO datasets (id, source_id, name, description, tags, url, update_frequency, last_confirmed, access_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO datasets_fts (rowid, name, description, tags, source_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  const getDatasetRowid = db.prepare(`
    SELECT rowid FROM datasets WHERE source_id = ? AND id = ?
  `);

  // トランザクションで一括処理。途中失敗時は全ロールバック
  const rebuildAll = db.transaction(() => {
    for (const entry of entries) {
      const s = entry.source;
      insertSource.run(
        s.id, s.name, s.url, s.description, s.provider, s.category,
        s.api ? JSON.stringify(s.api) : null,
        JSON.stringify(s.formats)
      );
      sourceCount++;

      for (const d of entry.datasets) {
        const tagsJson = JSON.stringify(d.tags);
        insertDataset.run(
          d.id, s.id, d.name, d.description, tagsJson, d.url,
          d.update_frequency ?? null, d.last_confirmed, d.access_method, d.notes ?? null
        );
        // datasets.rowid と FTS5.rowid を明示的に一致させる
        const row = getDatasetRowid.get(s.id, d.id) as { rowid: number };
        insertFts.run(row.rowid, d.name, d.description, d.tags.join(" "), s.name);
        datasetCount++;
      }
    }
  });

  rebuildAll();
  return { sources: sourceCount, datasets: datasetCount };
}

// =============================================================================
// FTS5全文検索
// =============================================================================

/**
 * FTS5でカタログを全文検索する。
 *
 * クエリ変換: "人口 都道府県" → '"人口" OR "都道府県"'
 * 各単語をダブルクォートで囲み OR 結合することで、いずれかの語にマッチさせる。
 *
 * FTS5の rank は負の値で、値が小さいほど関連度が高い。
 * datasets_fts と datasets を rowid で JOIN して結果を返す。
 */
export function searchCatalog(query: string, limit = 10): Array<{ source: Source; dataset: Dataset; rank: number }> {
  const db = getDb();

  const ftsQuery = query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"`)
    .join(" OR ");

  if (!ftsQuery) return [];

  const rows = db.prepare(`
    SELECT
      d.*,
      s.name AS source_name,
      s.url AS source_url,
      s.description AS source_description,
      s.provider,
      s.category,
      s.api_json,
      s.formats AS source_formats,
      fts.rank
    FROM datasets_fts fts
    JOIN datasets d ON d.rowid = fts.rowid
    JOIN sources s ON s.id = d.source_id
    WHERE datasets_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `).all(ftsQuery, limit) as Array<Record<string, unknown>>;

  // SQLiteの行データを TypeScript 型にマッピング
  // api_json, formats, tags はJSON文字列なのでパースする
  return rows.map((row) => ({
    source: {
      id: row.source_id as string,
      name: row.source_name as string,
      url: row.source_url as string,
      description: row.source_description as string,
      provider: row.provider as string,
      category: row.category as Source["category"],
      api: row.api_json ? JSON.parse(row.api_json as string) : undefined,
      formats: JSON.parse(row.source_formats as string),
    },
    dataset: {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      tags: JSON.parse(row.tags as string),
      url: row.url as string,
      update_frequency: row.update_frequency as string | undefined,
      last_confirmed: row.last_confirmed as string,
      access_method: row.access_method as Dataset["access_method"],
      notes: row.notes as string | undefined,
    },
    rank: row.rank as number,
  }));
}

// =============================================================================
// カタログ登録 (SQLite + YAML 同時書き込み)
// =============================================================================

/**
 * データセット情報をカタログに登録する。
 *
 * 書き込み先:
 *   1. SQLite: UPSERT で即座に検索可能になる
 *   2. YAML: カテゴリ別サブディレクトリに書き出し (Git管理用)
 *
 * 既存ソースに対して登録した場合:
 *   - SQLite: ON CONFLICT で既存レコードを更新
 *   - YAML: 既存ファイルに新規データセットのみ追記 (ID重複は除外)
 *   - FTS5: 新規データセットのみインデックスに追加
 *
 * @param options.skipYaml true の場合、YAML書き出しをスキップ (テスト用)
 */
export function registerEntry(entry: CatalogEntry, options?: { skipYaml?: boolean }): string {
  const db = getDb();
  const s = entry.source;

  const upsertSource = db.prepare(`
    INSERT INTO sources (id, name, url, description, provider, category, api_json, formats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, url=excluded.url, description=excluded.description,
      provider=excluded.provider, category=excluded.category,
      api_json=excluded.api_json, formats=excluded.formats,
      updated_at=datetime('now')
  `);

  const upsertDataset = db.prepare(`
    INSERT INTO datasets (id, source_id, name, description, tags, url, update_frequency, last_confirmed, access_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, id) DO UPDATE SET
      name=excluded.name, description=excluded.description, tags=excluded.tags,
      url=excluded.url, update_frequency=excluded.update_frequency,
      last_confirmed=excluded.last_confirmed, access_method=excluded.access_method, notes=excluded.notes
  `);

  // FTS5 に rowid を明示指定して挿入 (datasets.rowid と一致させる)
  const insertFtsWithRowid = db.prepare(`
    INSERT INTO datasets_fts (rowid, name, description, tags, source_name)
    VALUES (?, ?, ?, ?, ?)
  `);

  const deleteFtsByRowid = db.prepare(`
    DELETE FROM datasets_fts WHERE rowid = ?
  `);

  const getDatasetRowid = db.prepare(`
    SELECT rowid FROM datasets WHERE source_id = ? AND id = ?
  `);

  let newCount = 0;
  let updatedCount = 0;

  // トランザクション内で原子的に処理
  const register = db.transaction(() => {
    upsertSource.run(
      s.id, s.name, s.url, s.description, s.provider, s.category,
      s.api ? JSON.stringify(s.api) : null,
      JSON.stringify(s.formats)
    );

    for (const d of entry.datasets) {
      const existingRow = getDatasetRowid.get(s.id, d.id) as { rowid: number } | undefined;
      const tagsJson = JSON.stringify(d.tags);

      if (existingRow) {
        // 既存データセット: FTS を削除してから datasets を更新し、同じ rowid で FTS を再挿入
        deleteFtsByRowid.run(existingRow.rowid);
      }

      upsertDataset.run(
        d.id, s.id, d.name, d.description, tagsJson, d.url,
        d.update_frequency ?? null, d.last_confirmed, d.access_method, d.notes ?? null
      );

      // UPSERT 後の rowid を取得して FTS に同じ rowid で挿入
      const row = getDatasetRowid.get(s.id, d.id) as { rowid: number };
      insertFtsWithRowid.run(row.rowid, d.name, d.description, d.tags.join(" "), s.name);

      if (existingRow) {
        updatedCount++;
      } else {
        newCount++;
      }
    }
  });

  register();

  if (options?.skipYaml) {
    return `SQLite: ${newCount} 件追加`;
  }

  const yamlResult = saveYaml(entry);

  return `SQLite: ${newCount} 件追加, ${yamlResult}`;
}

/**
 * YAMLファイルに保存する。
 * ファイルパス: sources/{category}/{source_id}.yaml
 *
 * 既存ファイルがある場合はソース情報を上書きし、データセットをIDベースでマージする。
 * カテゴリが変更された場合は旧カテゴリの YAML を削除してから新カテゴリに書き込む。
 * カテゴリ別のサブディレクトリがなければ自動作成する。
 */
function saveYaml(entry: CatalogEntry): string {
  // カテゴリ変更に備え、他カテゴリにある同一 source.id の YAML を探索・削除
  removeStaleYaml(entry.source.id, entry.source.category);

  const categoryDir = path.join(SOURCES_DIR, entry.source.category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const filePath = path.join(categoryDir, `${entry.source.id}.yaml`);

  // 既存ファイルがあればソース情報を上書きし、データセットをIDベースでマージ
  if (fs.existsSync(filePath)) {
    const existing = parse(fs.readFileSync(filePath, "utf-8")) as CatalogEntry;
    const existingById = new Map(existing.datasets.map((d) => [d.id, d]));

    // 新しいエントリのデータセットで既存を上書き、残りは保持
    for (const d of entry.datasets) {
      existingById.set(d.id, d);
    }

    const merged: CatalogEntry = {
      source: entry.source,
      datasets: [...existingById.values()],
    };

    fs.writeFileSync(filePath, stringify(merged), "utf-8");
    return `YAML: ${filePath} を更新 (${entry.datasets.length} 件マージ)`;
  }

  fs.writeFileSync(filePath, stringify(entry), "utf-8");
  return `YAML: ${filePath} を新規作成 (${entry.datasets.length} 件)`;
}

// =============================================================================
// 統計・詳細取得
// =============================================================================

/** カタログの統計情報を集計する。ソース数、データセット数、カテゴリ別内訳 */
export function getCatalogStats(): { sources: number; datasets: number; categories: Record<string, number> } {
  const db = getDb();

  const sourceCount = (db.prepare("SELECT COUNT(*) AS cnt FROM sources").get() as { cnt: number }).cnt;
  const datasetCount = (db.prepare("SELECT COUNT(*) AS cnt FROM datasets").get() as { cnt: number }).cnt;

  const categoryRows = db.prepare("SELECT category, COUNT(*) AS cnt FROM sources GROUP BY category").all() as Array<{ category: string; cnt: number }>;
  const categories: Record<string, number> = {};
  for (const row of categoryRows) {
    categories[row.category] = row.cnt;
  }

  return { sources: sourceCount, datasets: datasetCount, categories };
}

/**
 * 特定ソースの詳細情報を取得する。
 * ソースが見つからない場合は null を返す。
 */
export function getSourceDetail(sourceId: string): { source: Source; datasets: Dataset[] } | null {
  const db = getDb();

  const sourceRow = db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId) as Record<string, unknown> | undefined;
  if (!sourceRow) return null;

  const source: Source = {
    id: sourceRow.id as string,
    name: sourceRow.name as string,
    url: sourceRow.url as string,
    description: sourceRow.description as string,
    provider: sourceRow.provider as string,
    category: sourceRow.category as Source["category"],
    api: sourceRow.api_json ? JSON.parse(sourceRow.api_json as string) : undefined,
    formats: JSON.parse(sourceRow.formats as string),
  };

  const datasetRows = db.prepare("SELECT * FROM datasets WHERE source_id = ?").all(sourceId) as Array<Record<string, unknown>>;
  const datasets: Dataset[] = datasetRows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    tags: JSON.parse(row.tags as string),
    url: row.url as string,
    update_frequency: row.update_frequency as string | undefined,
    last_confirmed: row.last_confirmed as string,
    access_method: row.access_method as Dataset["access_method"],
    notes: row.notes as string | undefined,
  }));

  return { source, datasets };
}
