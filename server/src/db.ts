import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SQLite-Persistenz (eingebautes node:sqlite — keine nativen Dependencies).
 *
 * Event-Sourcing: `events` ist das append-only Audit-Log und die Quelle der
 * Wahrheit. `games.snapshot` ist nur ein Performance-Cache des aktuellen
 * States — jederzeit per Replay aus den Events rekonstruierbar.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.BOARDROOM_DATA_DIR ?? path.join(here, '..', 'data');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, 'boardroom.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS games (
      game_id     TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      snapshot    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      seq      INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id  TEXT NOT NULL,
      week     INTEGER NOT NULL,
      at_iso   TEXT NOT NULL,
      type     TEXT NOT NULL,
      payload  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id, seq);

    CREATE TABLE IF NOT EXISTS week_reports (
      game_id  TEXT NOT NULL,
      week     INTEGER NOT NULL,
      report   TEXT NOT NULL,
      PRIMARY KEY (game_id, week)
    );

    -- LLM-Erzähltexte, strikt getrennt vom deterministischen State.
    CREATE TABLE IF NOT EXISTS llm_narratives (
      evaluation_id TEXT PRIMARY KEY,
      game_id       TEXT NOT NULL,
      text          TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    -- Response-Cache: identische Anfragen nicht doppelt bezahlen.
    CREATE TABLE IF NOT EXISTS llm_cache (
      hash       TEXT PRIMARY KEY,
      response   TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- UI-Overlay: Lese-/Archiv-Status je Nachricht (nicht Teil des Engine-States).
    CREATE TABLE IF NOT EXISTS message_status (
      game_id    TEXT NOT NULL,
      message_id TEXT NOT NULL,
      status     TEXT NOT NULL,
      PRIMARY KEY (game_id, message_id)
    );

    -- Freie Dialoge (Erzählschicht): Mail-Antworten, DMs, Meeting-Szenen.
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id    TEXT NOT NULL,
      thread_key TEXT NOT NULL,
      author     TEXT NOT NULL,
      author_role TEXT NOT NULL,
      is_player  INTEGER NOT NULL,
      text       TEXT NOT NULL,
      at_iso     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(game_id, thread_key, id);

    -- Berater-Reports (Phase 4).
    CREATE TABLE IF NOT EXISTS consultant_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id     TEXT NOT NULL,
      week        INTEGER NOT NULL,
      topic       TEXT NOT NULL,
      report_json TEXT NOT NULL,
      at_iso      TEXT NOT NULL
    );

    -- Was-wäre-wenn-Labor (Phase 4): Fork-Stammbaum.
    CREATE TABLE IF NOT EXISTS forks (
      game_id        TEXT PRIMARY KEY,
      parent_game_id TEXT NOT NULL,
      fork_week      INTEGER NOT NULL
    );

    -- Pressemitteilungen + simuliertes Medienecho (Phase 3).
    CREATE TABLE IF NOT EXISTS press_releases (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id     TEXT NOT NULL,
      week        INTEGER NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      article     TEXT NOT NULL,
      verdict     TEXT NOT NULL,
      press_delta INTEGER NOT NULL,
      at_iso      TEXT NOT NULL
    );

    -- Token-Kosten-Tracking für das Dashboard in den Einstellungen.
    CREATE TABLE IF NOT EXISTS llm_usage (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      at_iso        TEXT NOT NULL,
      task          TEXT NOT NULL,
      model         TEXT NOT NULL,
      input_tokens  INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd      REAL NOT NULL,
      cached        INTEGER NOT NULL DEFAULT 0
    );
  `);
}
