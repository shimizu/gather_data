import Database from "better-sqlite3";
import path from "node:path";

const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, "../catalog.db");

let _db: Database.Database | null = null;

/** DBパスを指定して初期化。":memory:" でインメモリDB (テスト用) */
export function initDb(dbPath?: string): Database.Database {
  if (_db) {
    _db.close();
    _db = null;
  }

  _db = new Database(dbPath ?? DEFAULT_DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  return _db;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  return initDb();
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      url         TEXT NOT NULL,
      description TEXT NOT NULL,
      provider    TEXT NOT NULL,
      category    TEXT NOT NULL CHECK(category IN ('government','international','private','academic')),
      api_json    TEXT,
      formats     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id               TEXT NOT NULL,
      source_id        TEXT NOT NULL REFERENCES sources(id),
      name             TEXT NOT NULL,
      description      TEXT NOT NULL,
      tags             TEXT NOT NULL,
      url              TEXT NOT NULL,
      update_frequency TEXT,
      last_confirmed   TEXT NOT NULL,
      access_method    TEXT NOT NULL CHECK(access_method IN ('api','download','scrape')),
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_id, id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS datasets_fts USING fts5(
      name,
      description,
      tags,
      source_name,
      tokenize='unicode61'
    );
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
