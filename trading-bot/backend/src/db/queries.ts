import { db } from './schema';
import { randomUUID } from 'crypto';

export const now = () => Date.now();
export const uid = () => randomUUID();

export const insertResearch = db.prepare(
  `INSERT INTO research_signals (id, ticker, source, content, sentiment_score, sentiment_label, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
export const getRecentResearch = (sinceMs = 6 * 60 * 60 * 1000) =>
  db.prepare(`SELECT * FROM research_signals WHERE created_at > ? ORDER BY created_at DESC LIMIT 500`)
    .all(now() - sinceMs);
export const getResearchByTicker = (ticker: string, sinceMs = 24 * 60 * 60 * 1000) =>
  db.prepare(`SELECT * FROM research_signals WHERE ticker = ? AND created_at > ? ORDER BY created_at DESC`)
    .all(ticker, now() - sinceMs);

export const insertFiltered = db.prepare(
  `INSERT INTO filtered_markets (id, ticker, company_name, current_price, volume_ratio, priority_score, flag_level, filters_passed, scanned_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
export const getLatestFiltered = () =>
  db.prepare(`SELECT * FROM filtered_markets ORDER BY scanned_at DESC, priority_score DESC LIMIT 100`).all();

export const insertPrediction = db.prepare(
  `INSERT INTO predictions (id, ticker, feature_vector, llm_probability, market_probability, edge_score, confidence, key_factors, risk_factors, rationale, suggested_entry, stop_loss, target_price, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
export const getLatestPredictions = () =>
  db.prepare(`SELECT * FROM predictions ORDER BY created_at DESC LIMIT 50`).all();

export const insertAlert = db.prepare(
  `INSERT INTO alerts (id, prediction_id, ticker, action, full_alert, is_active, created_at)
   VALUES (?, ?, ?, ?, ?, 1, ?)`
);
export const getLatestAlerts = () =>
  db.prepare(`SELECT * FROM alerts WHERE is_active = 1 ORDER BY created_at DESC LIMIT 50`).all();
export const getAlertHistory = (limit = 50, offset = 0) =>
  db.prepare(`SELECT * FROM alerts ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);

export const insertOutcome = db.prepare(
  `INSERT INTO trade_outcomes (id, alert_id, ticker, entry_price, exit_price, outcome, pnl_percent, lesson, notes, recorded_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
export const getAllOutcomes = () =>
  db.prepare(`SELECT * FROM trade_outcomes ORDER BY recorded_at DESC`).all();
export const getRecentOutcomes = (limit = 10) =>
  db.prepare(`SELECT * FROM trade_outcomes ORDER BY recorded_at DESC LIMIT ?`).all(limit);

export const insertWeights = db.prepare(
  `INSERT INTO model_weights (id, version, weights, accuracy, trained_on, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
export const getLatestWeights = () =>
  db.prepare(`SELECT * FROM model_weights ORDER BY version DESC LIMIT 1`).get() as any;
