"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { StreamEvent } from "@/lib/types";

const AGENT_COLORS: Record<string, string> = {
  Researcher: "text-cyan-400",
  "Bull Analyst": "text-emerald-400",
  "Bear Analyst": "text-red-400",
  "Technical Analyst": "text-violet-400",
  "Macro Analyst": "text-amber-400",
  Judge: "text-zinc-300",
  "Risk Manager": "text-orange-400",
  "Decision Maker": "text-sky-400",
};

const AGENT_ICONS: Record<string, string> = {
  Researcher: "R",
  "Bull Analyst": "B+",
  "Bear Analyst": "B-",
  "Technical Analyst": "TQ",
  "Macro Analyst": "MC",
  Judge: "J",
  "Risk Manager": "RM",
  "Decision Maker": "PM",
};

interface Message {
  id: number;
  agent: string;
  round?: number;
  content: string;
  type: "token" | "done" | "judge" | "status";
}

interface DossierData {
  ticker: string;
  generated_at: string;
  snapshot: Record<string, unknown>;
  recent_news: Array<{ claim: string; source: string; date: string }>;
  sentiment: { bull_signals: string[]; bear_signals: string[] };
  data_gaps: string[];
  [key: string]: unknown;
}

interface RiskMemoData {
  worst_case: string;
  invalidation_level: string;
  key_risks: string[];
  suggested_size: string;
  asymmetry: string;
  flag: string;
}

interface VerdictData {
  ticker: string;
  action: string;
  conviction: number;
  time_horizon: string;
  entry_zone?: string;
  invalidation: string;
  position_size_note: string;
  strongest_reasons_for: string[];
  strongest_reason_against: string;
  what_would_change_our_mind: string;
  risk_flag: string;
  analyst_split: Record<string, number>;
}

interface SessionListItem {
  id: string;
  created_at: string;
  ticker: string;
  status: string;
}

export default function Home() {
  const [ticker, setTicker] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("");
  const [dossier, setDossier] = useState<DossierData | null>(null);
  const [riskMemo, setRiskMemo] = useState<RiskMemoData | null>(null);
  const [verdict, setVerdict] = useState<VerdictData | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [error, setError] = useState("");
  const msgIdRef = useRef(0);
  const streamRef = useRef<Map<string, string>>(new Map());
  const debateRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/session");
      if (res.ok) setSessions(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadSession = async (id: string) => {
    try {
      const res = await fetch(`/api/session?id=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setDossier(data.dossier);
      setRiskMemo(data.riskMemo);
      setVerdict(data.verdict);
      setMessages(
        data.messages.map((m: { agent: string; round: number; content: string }, i: number) => ({
          id: i,
          agent: m.agent,
          round: m.round,
          content: m.content,
          type: "done" as const,
        }))
      );
      setStatus(`Loaded session for ${data.session.ticker}`);
      setTicker(data.session.ticker);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t || running) return;
    setRunning(true);
    setError("");
    setMessages([]);
    setDossier(null);
    setRiskMemo(null);
    setVerdict(null);
    streamRef.current.clear();

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Request failed");
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;

          try {
            const event: StreamEvent = JSON.parse(payload);
            handleEvent(event);
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setRunning(false);
      loadSessions();
    }
  };

  const handleEvent = (event: StreamEvent) => {
    switch (event.type) {
      case "status":
        setStatus(event.content || "");
        break;
      case "agent_start": {
        const key = `${event.agent}-${event.round || 0}`;
        streamRef.current.set(key, "");
        setMessages((prev) => [
          ...prev,
          {
            id: ++msgIdRef.current,
            agent: event.agent || "",
            round: event.round,
            content: "",
            type: "token",
          },
        ]);
        break;
      }
      case "agent_token": {
        const key = `${event.agent}-${event.round || 0}`;
        const current = streamRef.current.get(key) || "";
        streamRef.current.set(key, current + (event.content || ""));
        setMessages((prev) =>
          prev.map((m) =>
            m.agent === event.agent && m.round === (event.round || undefined) && m.type === "token"
              ? { ...m, content: streamRef.current.get(key) || "" }
              : m
          )
        );
        if (debateRef.current) {
          debateRef.current.scrollTop = debateRef.current.scrollHeight;
        }
        break;
      }
      case "agent_done": {
        setMessages((prev) =>
          prev.map((m) =>
            m.agent === event.agent && m.round === (event.round || undefined) && m.type === "token"
              ? { ...m, type: "done" }
              : m
          )
        );
        break;
      }
      case "dossier":
        setDossier(event.data as DossierData);
        break;
      case "judge":
        setMessages((prev) => [
          ...prev,
          {
            id: ++msgIdRef.current,
            agent: "Judge",
            round: event.round,
            content: JSON.stringify(event.data, null, 2),
            type: "judge",
          },
        ]);
        break;
      case "risk_memo":
        setRiskMemo(event.data as RiskMemoData);
        break;
      case "verdict":
        setVerdict(event.data as VerdictData);
        break;
      case "error":
        setError(event.content || "Unknown error");
        break;
    }
  };

  const actionColor = (action?: string) => {
    switch (action) {
      case "Strong Buy": return "text-emerald-400 bg-emerald-950 border-emerald-700";
      case "Buy": return "text-emerald-300 bg-emerald-950/50 border-emerald-800";
      case "Hold": return "text-zinc-300 bg-zinc-800 border-zinc-600";
      case "Avoid": return "text-red-300 bg-red-950/50 border-red-800";
      case "Short": return "text-red-400 bg-red-950 border-red-700";
      default: return "text-zinc-300 bg-zinc-800 border-zinc-600";
    }
  };

  const tensionScore = verdict?.analyst_split
    ? Math.max(
        ...Object.values(verdict.analyst_split)
      ) - Math.min(...Object.values(verdict.analyst_split))
    : 0;

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-0">
      {/* Left sidebar */}
      <div className="w-72 border-r border-zinc-800 flex flex-col bg-zinc-950/50">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold tracking-tight mb-3">Stock Arena</h1>
          <div className="flex gap-2">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="TICKER"
              maxLength={5}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 placeholder-zinc-600 uppercase"
              disabled={running}
            />
            <button
              onClick={handleSubmit}
              disabled={running || !ticker.trim()}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              {running ? "..." : "Go"}
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-xs mt-2">{error}</p>
          )}
          {status && (
            <p className="text-zinc-500 text-xs mt-2">{status}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Recent Sessions
          </p>
          {sessions.length === 0 && (
            <p className="text-xs text-zinc-600">No sessions yet</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className="w-full text-left px-3 py-2 rounded text-sm hover:bg-zinc-800/50 transition-colors mb-1"
            >
              <span className="font-medium">{s.ticker}</span>
              <span className="text-zinc-500 ml-2 text-xs">{s.status}</span>
              <br />
              <span className="text-zinc-600 text-xs">
                {new Date(s.created_at).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Center — debate thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-zinc-800 px-6 py-3 flex items-center gap-3">
          <h2 className="text-sm font-medium text-zinc-400">
            {ticker ? `Debate: ${ticker}` : "Enter a ticker to begin"}
          </h2>
          {running && (
            <span className="text-xs text-amber-400 animate-pulse-glow">
              LIVE
            </span>
          )}
        </div>
        <div ref={debateRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && !running && (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              Type a ticker and hit Go to start a debate
            </div>
          )}
          {messages.map((msg) => {
            if (msg.type === "judge") {
              let judgeData: { agreements?: string[]; open_disputes?: string[]; converged?: boolean } = {};
              try { judgeData = JSON.parse(msg.content); } catch { /* ignore */ }
              return (
                <div key={msg.id} className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50 my-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                      J
                    </span>
                    <span className="text-sm font-medium text-zinc-300">
                      Judge — Round {msg.round} Summary
                    </span>
                    {judgeData.converged && (
                      <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">
                        CONVERGED
                      </span>
                    )}
                  </div>
                  {judgeData.agreements && (
                    <div className="mb-2">
                      <p className="text-xs text-zinc-500 mb-1">Agreements:</p>
                      {judgeData.agreements.map((a, i) => (
                        <p key={i} className="text-xs text-zinc-400 ml-3">+ {a}</p>
                      ))}
                    </div>
                  )}
                  {judgeData.open_disputes && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Open Disputes:</p>
                      {judgeData.open_disputes.map((d, i) => (
                        <p key={i} className="text-xs text-amber-300/70 ml-3">- {d}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex gap-3">
                <div
                  className={`w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 ${AGENT_COLORS[msg.agent] || "text-zinc-400"}`}
                >
                  {AGENT_ICONS[msg.agent] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${AGENT_COLORS[msg.agent] || "text-zinc-400"}`}>
                      {msg.agent}
                    </span>
                    {msg.round && (
                      <span className="text-xs text-zinc-600">
                        Round {msg.round}
                      </span>
                    )}
                    {msg.type === "token" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                  <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right sidebar — results */}
      <div className="w-96 border-l border-zinc-800 overflow-y-auto flex flex-col bg-zinc-950/50">
        {/* Dossier summary */}
        {dossier && (
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-cyan-400 mb-2">
              Dossier: {dossier.ticker}
            </h3>
            <div className="text-xs text-zinc-500 mb-3">
              {dossier.generated_at}
            </div>
            {dossier.snapshot && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                {Object.entries(dossier.snapshot).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-zinc-500">{k}: </span>
                    <span className="text-zinc-300">{String(v ?? "—")}</span>
                  </div>
                ))}
              </div>
            )}
            {dossier.recent_news?.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-zinc-500 mb-1">Recent News:</p>
                {dossier.recent_news.slice(0, 3).map((n, i) => (
                  <p key={i} className="text-xs text-zinc-400 mb-1">
                    {n.claim}
                    <span className="text-zinc-600 ml-1">({n.date})</span>
                  </p>
                ))}
              </div>
            )}
            {dossier.data_gaps?.length > 0 && (
              <div>
                <p className="text-xs text-amber-500">
                  Data gaps: {dossier.data_gaps.join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Risk Memo */}
        {riskMemo && (
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-orange-400 mb-2">
              Risk Memo
            </h3>
            <div className={`inline-block text-xs font-bold px-2 py-0.5 rounded mb-2 ${
              riskMemo.flag === "PROCEED"
                ? "bg-emerald-900/50 text-emerald-400"
                : riskMemo.flag === "PROCEED_SMALL"
                ? "bg-amber-900/50 text-amber-400"
                : "bg-red-900/50 text-red-400"
            }`}>
              {riskMemo.flag}
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-zinc-500">Worst case: </span>
                <span className="text-zinc-300">{riskMemo.worst_case}</span>
              </div>
              <div>
                <span className="text-zinc-500">Invalidation: </span>
                <span className="text-zinc-300">{riskMemo.invalidation_level}</span>
              </div>
              <div>
                <span className="text-zinc-500">Size: </span>
                <span className="text-zinc-300">{riskMemo.suggested_size}</span>
              </div>
              <div>
                <span className="text-zinc-500">Asymmetry: </span>
                <span className="text-zinc-300">{riskMemo.asymmetry}</span>
              </div>
              {riskMemo.key_risks?.length > 0 && (
                <div>
                  <span className="text-zinc-500">Key risks:</span>
                  {riskMemo.key_risks.map((r, i) => (
                    <p key={i} className="text-zinc-400 ml-2">- {r}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Verdict */}
        {verdict && (
          <div className="p-4">
            <h3 className="text-sm font-medium text-sky-400 mb-3">
              Final Verdict
            </h3>

            <div className={`text-2xl font-bold text-center py-3 px-4 rounded-lg border mb-4 ${actionColor(verdict.action)}`}>
              {verdict.action}
            </div>

            {/* Conviction meter */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>Conviction</span>
                <span>{verdict.conviction}/100</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-zinc-600 to-sky-500"
                  style={{ width: `${verdict.conviction}%` }}
                />
              </div>
            </div>

            {/* Tension meter */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>Analyst Tension</span>
                <span>{tensionScore} pts spread</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    tensionScore > 40
                      ? "bg-red-500"
                      : tensionScore > 20
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(tensionScore, 100)}%` }}
                />
              </div>
              {tensionScore > 30 && (
                <p className="text-xs text-amber-400 mt-1">
                  High disagreement — conviction capped by design
                </p>
              )}
            </div>

            {/* Analyst split */}
            {verdict.analyst_split && (
              <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                {Object.entries(verdict.analyst_split).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className={`${
                      k === "bull" ? "text-emerald-400" :
                      k === "bear" ? "text-red-400" :
                      k === "technical" ? "text-violet-400" : "text-amber-400"
                    }`}>{k}</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-500 rounded-full" style={{ width: `${v}%` }} />
                    </div>
                    <span className="text-zinc-500 w-6 text-right">{v}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-zinc-500">Time horizon: </span>
                <span className="text-zinc-300">{verdict.time_horizon}</span>
              </div>
              {verdict.entry_zone && (
                <div>
                  <span className="text-zinc-500">Entry zone: </span>
                  <span className="text-zinc-300">{verdict.entry_zone}</span>
                </div>
              )}
              <div>
                <span className="text-zinc-500">Invalidation: </span>
                <span className="text-zinc-300">{verdict.invalidation}</span>
              </div>
              <div>
                <span className="text-zinc-500">Position size: </span>
                <span className="text-zinc-300">{verdict.position_size_note}</span>
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <p className="text-emerald-400 text-xs font-medium mb-1">Reasons For:</p>
                {verdict.strongest_reasons_for?.map((r, i) => (
                  <p key={i} className="text-zinc-300 ml-2 mb-1">+ {r}</p>
                ))}
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <p className="text-red-400 text-xs font-medium mb-1">
                  Strongest Reason Against:
                </p>
                <p className="text-red-300 ml-2 font-medium">
                  {verdict.strongest_reason_against}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <p className="text-zinc-500 text-xs mb-1">
                  What would change our mind:
                </p>
                <p className="text-zinc-300 ml-2">
                  {verdict.what_would_change_our_mind}
                </p>
              </div>
            </div>
          </div>
        )}

        {!dossier && !riskMemo && !verdict && (
          <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm p-4 text-center">
            Results will appear here as the debate unfolds
          </div>
        )}
      </div>
    </div>
  );
}
