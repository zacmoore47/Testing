export interface Dossier {
  ticker: string;
  generated_at: string;
  snapshot: {
    price?: number;
    market_cap?: string;
    pe_ratio?: number;
    sector?: string;
    industry?: string;
    exchange?: string;
    fifty_two_week_high?: number;
    fifty_two_week_low?: number;
    avg_volume?: number;
  };
  valuation: Record<string, unknown>;
  fundamentals: Record<string, unknown>;
  recent_news: Array<{ claim: string; source: string; date: string }>;
  sentiment: {
    bull_signals: string[];
    bear_signals: string[];
  };
  competitors: Array<{ name: string; relative_position: string }>;
  catalysts: Array<{ event: string; date: string }>;
  bull_facts: string[];
  bear_facts: string[];
  data_gaps: string[];
}

export interface AnalystMessage {
  agent: string;
  role: "bull" | "bear" | "technical" | "macro";
  round: number;
  content: string;
  stance: string;
  confidence: number;
}

export interface JudgeSummary {
  agreements: string[];
  open_disputes: string[];
  converged: boolean;
}

export interface RiskMemo {
  worst_case: string;
  invalidation_level: string;
  key_risks: string[];
  suggested_size: string;
  asymmetry: string;
  flag: "PROCEED" | "PROCEED_SMALL" | "STAND_ASIDE";
}

export interface Verdict {
  ticker: string;
  action: "Strong Buy" | "Buy" | "Hold" | "Avoid" | "Short";
  conviction: number;
  time_horizon: string;
  entry_zone?: string;
  invalidation: string;
  position_size_note: string;
  strongest_reasons_for: string[];
  strongest_reason_against: string;
  what_would_change_our_mind: string;
  risk_flag: "PROCEED" | "PROCEED_SMALL" | "STAND_ASIDE";
  analyst_split: {
    bull: number;
    bear: number;
    technical: number;
    macro: number;
  };
}

export interface Session {
  id: string;
  created_at: string;
  ticker: string;
  status: "researching" | "debating" | "risking" | "deciding" | "done" | "error";
}

export interface StreamEvent {
  type: "status" | "agent_start" | "agent_token" | "agent_done" | "dossier" | "judge" | "risk_memo" | "verdict" | "error" | "cost";
  agent?: string;
  round?: number;
  content?: string;
  data?: unknown;
}
