import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { getDb } from "./db.js";
import { CatalogEntrySchema } from "./types.js";
import type { CatalogEntry, Source, Dataset } from "./types.js";

const SOURCES_DIR = path.resolve(import.meta.dirname, "../sources");

// --- YAML読み込み ---

/** sources/ 以下の全YAMLを再帰的に読み込む */
export function loadAllYaml(): CatalogEntry[] {
  if (!fs.existsSync(SOURCES_DIR)) return [];

  const entries: CatalogEntry[] = [];
  walkYamlFiles(SOURCES_DIR, (filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = parse(content);
    const result = CatalogEntrySchema.safeParse(data);
    if (result.success) {
      entries.push(result.data);
    } else {
      console.error(`[WARN] ${filePath} のパースに失敗: ${result.error.message}`);
    }
  });
  return entries;
}

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

// --- SQLite操作 ---

/** YAML → SQLite全件再構築 */
export function rebuildIndex(): { sources: number; datasets: number } {
  const db = getDb();
  const entries = loadAllYaml();

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
    INSERT INTO datasets_fts (name, description, tags, source_name)
    VALUES (?, ?, ?, ?)
  `);

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
        insertFts.run(d.name, d.description, d.tags.join(" "), s.name);
        datasetCount++;
      }
    }
  });

  rebuildAll();
  return { sources: sourceCount, datasets: datasetCount };
}

/** FTS5でカタログを検索 */
export function searchCatalog(query: string, limit = 10): Array<{ source: Source; dataset: Dataset; rank: number }> {
  const db = getDb();

  // FTS5用のクエリに変換: スペースをORに
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

/** カタログにエントリを登録 (SQLite + YAML 同時書き込み。skipYaml: true でSQLiteのみ) */
export function registerEntry(entry: CatalogEntry, options?: { skipYaml?: boolean }): string {
  const db = getDb();
  const s = entry.source;

  // SQLiteに書き込み
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

  const insertFts = db.prepare(`
    INSERT INTO datasets_fts (name, description, tags, source_name)
    VALUES (?, ?, ?, ?)
  `);

  let newCount = 0;

  const register = db.transaction(() => {
    upsertSource.run(
      s.id, s.name, s.url, s.description, s.provider, s.category,
      s.api ? JSON.stringify(s.api) : null,
      JSON.stringify(s.formats)
    );

    for (const d of entry.datasets) {
      const existing = db.prepare("SELECT 1 FROM datasets WHERE source_id = ? AND id = ?").get(s.id, d.id);
      const tagsJson = JSON.stringify(d.tags);

      upsertDataset.run(
        d.id, s.id, d.name, d.description, tagsJson, d.url,
        d.update_frequency ?? null, d.last_confirmed, d.access_method, d.notes ?? null
      );

      if (!existing) {
        insertFts.run(d.name, d.description, d.tags.join(" "), s.name);
        newCount++;
      }
    }
  });

  register();

  if (options?.skipYaml) {
    return `SQLite: ${newCount} 件追加`;
  }

  // YAMLにも書き出し
  const yamlResult = saveYaml(entry);

  return `SQLite: ${newCount} 件追加, ${yamlResult}`;
}

/** YAMLファイルに保存 (カテゴリ別サブディレクトリ) */
function saveYaml(entry: CatalogEntry): string {
  const categoryDir = path.join(SOURCES_DIR, entry.source.category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const filePath = path.join(categoryDir, `${entry.source.id}.yaml`);

  if (fs.existsSync(filePath)) {
    const existing = parse(fs.readFileSync(filePath, "utf-8")) as CatalogEntry;
    const existingIds = new Set(existing.datasets.map((d) => d.id));
    const newDatasets = entry.datasets.filter((d) => !existingIds.has(d.id));
    existing.datasets.push(...newDatasets);
    fs.writeFileSync(filePath, stringify(existing), "utf-8");
    return `YAML: ${filePath} に ${newDatasets.length} 件追加`;
  }

  fs.writeFileSync(filePath, stringify(entry), "utf-8");
  return `YAML: ${filePath} を新規作成 (${entry.datasets.length} 件)`;
}

/** カタログの統計情報 */
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

/** 特定ソースの詳細を取得 */
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
