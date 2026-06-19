import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = path.join(process.cwd(), "stock-arena.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ticker TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'researching'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      agent TEXT NOT NULL,
      round INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      citations_json TEXT,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dossiers (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_memos (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verdicts (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      json TEXT NOT NULL
    );
  `);

  return db;
}

export function createSession(id: string, ticker: string): void {
  getDb()
    .prepare("INSERT INTO sessions (id, ticker) VALUES (?, ?)")
    .run(id, ticker);
}

export function updateSessionStatus(
  id: string,
  status: string
): void {
  getDb()
    .prepare("UPDATE sessions SET status = ? WHERE id = ?")
    .run(status, id);
}

export function saveMessage(
  sessionId: string,
  agent: string,
  round: number,
  content: string,
  confidence?: number
): void {
  getDb()
    .prepare(
      "INSERT INTO messages (session_id, agent, round, content, confidence) VALUES (?, ?, ?, ?, ?)"
    )
    .run(sessionId, agent, round, content, confidence ?? null);
}

export function saveDossier(sessionId: string, dossier: unknown): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO dossiers (session_id, json) VALUES (?, ?)"
    )
    .run(sessionId, JSON.stringify(dossier));
}

export function saveRiskMemo(sessionId: string, memo: unknown): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO risk_memos (session_id, json) VALUES (?, ?)"
    )
    .run(sessionId, JSON.stringify(memo));
}

export function saveVerdict(sessionId: string, verdict: unknown): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO verdicts (session_id, json) VALUES (?, ?)"
    )
    .run(sessionId, JSON.stringify(verdict));
}

export function getSessions(): Array<{
  id: string;
  created_at: string;
  ticker: string;
  status: string;
}> {
  return getDb()
    .prepare("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50")
    .all() as Array<{
    id: string;
    created_at: string;
    ticker: string;
    status: string;
  }>;
}

export function getSession(id: string) {
  const session = getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as { id: string; created_at: string; ticker: string; status: string } | undefined;
  if (!session) return null;

  const messages = getDb()
    .prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC"
    )
    .all(id) as Array<{
    agent: string;
    round: number;
    content: string;
    confidence: number | null;
  }>;

  const dossierRow = getDb()
    .prepare("SELECT json FROM dossiers WHERE session_id = ?")
    .get(id) as { json: string } | undefined;

  const riskRow = getDb()
    .prepare("SELECT json FROM risk_memos WHERE session_id = ?")
    .get(id) as { json: string } | undefined;

  const verdictRow = getDb()
    .prepare("SELECT json FROM verdicts WHERE session_id = ?")
    .get(id) as { json: string } | undefined;

  return {
    session,
    messages,
    dossier: dossierRow ? JSON.parse(dossierRow.json) : null,
    riskMemo: riskRow ? JSON.parse(riskRow.json) : null,
    verdict: verdictRow ? JSON.parse(verdictRow.json) : null,
  };
}
