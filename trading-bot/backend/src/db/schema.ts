import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'trading-bot.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_signals (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      sentiment_score REAL,
      sentiment_label TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS filtered_markets (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      company_name TEXT,
      current_price REAL,
      volume_ratio REAL,
      priority_score REAL,
      flag_level TEXT,
      filters_passed TEXT,
      scanned_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      feature_vector TEXT NOT NULL,
      llm_probability REAL,
      market_probability REAL,
      edge_score REAL,
      confidence TEXT,
      key_factors TEXT,
      risk_factors TEXT,
      rationale TEXT,
      suggested_entry REAL,
      stop_loss REAL,
      target_price REAL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      prediction_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      full_alert TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trade_outcomes (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      entry_price REAL,
      exit_price REAL,
      outcome TEXT,
      pnl_percent REAL,
      lesson TEXT,
      notes TEXT,
      recorded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_weights (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      weights TEXT NOT NULL,
      accuracy REAL,
      trained_on INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
}
