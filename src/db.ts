/**
 * SQLiteデータベースの初期化・マイグレーション。
 *
 * シングルトンパターンで接続を管理する。
 * テスト時は initDb(":memory:") でインメモリDBを使用できる。
 *
 * テーブル構成:
 *   - sources: データソース (Webサイト/データプロバイダ)
 *   - datasets: 個別データセット (sources に紐づく)
 *   - datasets_fts: FTS5全文検索インデックス (datasets の name, description, tags, source_name)
 */
import Database from "better-sqlite3";
import path from "node:path";

/** デフォルトのDBファイルパス。プロジェクトルート直下の catalog.db */
const DEFAULT_DB_PATH = path.resolve(import.meta.dirname, "../catalog.db");

/** シングルトンDB接続。initDb() または getDb() で初期化される */
let _db: Database.Database | null = null;

/**
 * DBを初期化して返す。既存接続があれば閉じてから再作成する。
 * @param dbPath DBファイルのパス。省略時はデフォルト。":memory:" でインメモリDB (テスト用)
 */
export function initDb(dbPath?: string): Database.Database {
  if (_db) {
    _db.close();
    _db = null;
  }

  _db = new Database(dbPath ?? DEFAULT_DB_PATH);

  // WALモード: 読み取りと書き込みを並行処理可能にする
  _db.pragma("journal_mode = WAL");
  // 外部キー制約を有効化 (datasets.source_id → sources.id)
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  return _db;
}

/** DB接続を取得する。未初期化の場合はデフォルトパスで自動初期化 */
export function getDb(): Database.Database {
  if (_db) return _db;
  return initDb();
}

/**
 * テーブルが存在しなければ作成する。
 * 既存テーブルには影響しない (CREATE TABLE IF NOT EXISTS)。
 *
 * カラムを追加する場合は ALTER TABLE か、catalog.db を削除して再構築する。
 * → rm catalog.db && npm run build:catalog
 */
function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      url         TEXT NOT NULL,
      description TEXT NOT NULL,
      provider    TEXT NOT NULL,
      category    TEXT NOT NULL CHECK(category IN ('government','international','private','academic')),
      api_json    TEXT,          -- API情報をJSON文字列で格納 (ApiSchema相当)
      formats     TEXT NOT NULL, -- JSON配列 (例: '["csv","json"]')
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id               TEXT NOT NULL,
      source_id        TEXT NOT NULL REFERENCES sources(id),
      name             TEXT NOT NULL,
      description      TEXT NOT NULL,
      tags             TEXT NOT NULL, -- JSON配列 (例: '["人口","世帯"]')
      url              TEXT NOT NULL,
      update_frequency TEXT,
      last_confirmed   TEXT NOT NULL,
      access_method    TEXT NOT NULL CHECK(access_method IN ('api','download','scrape')),
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_id, id)
    );

    -- FTS5全文検索インデックス。
    -- datasets テーブルと rowid で JOIN して使う。
    -- tokenize='unicode61' は日本語のUnicode文字をトークン化できる。
    CREATE VIRTUAL TABLE IF NOT EXISTS datasets_fts USING fts5(
      name,
      description,
      tags,          -- JSON配列ではなくスペース区切りテキストで格納
      source_name,   -- ソース名も検索対象に含める
      tokenize='unicode61'
    );
  `);
}

/** DB接続を閉じる。アプリ終了時に呼ぶ */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
