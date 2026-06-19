import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config";
import { Dossier, StreamEvent, JudgeSummary, RiskMemo, Verdict } from "../lib/types";
import { MarketDataProvider } from "../data/provider";
import { RESEARCHER_SYSTEM_PROMPT } from "../agents/researcher";
import { BULL_SYSTEM_PROMPT } from "../agents/bull";
import { BEAR_SYSTEM_PROMPT } from "../agents/bear";
import { TECHNICAL_SYSTEM_PROMPT } from "../agents/technical";
import { MACRO_SYSTEM_PROMPT } from "../agents/macro";
import { JUDGE_SYSTEM_PROMPT } from "../agents/judge";
import { RISK_MANAGER_SYSTEM_PROMPT } from "../agents/risk-manager";
import { DECISION_MAKER_SYSTEM_PROMPT } from "../agents/decision-maker";
import {
  createSession,
  updateSessionStatus,
  saveMessage,
  saveDossier,
  saveRiskMemo,
  saveVerdict,
} from "../lib/db";

type Emitter = (event: StreamEvent) => void;

interface AnalystResult {
  agent: string;
  role: "bull" | "bear" | "technical" | "macro";
  content: string;
  stance: string;
  confidence: number;
}

const ANALYST_CONFIGS = [
  { agent: "Bull Analyst", role: "bull" as const, prompt: BULL_SYSTEM_PROMPT },
  { agent: "Bear Analyst", role: "bear" as const, prompt: BEAR_SYSTEM_PROMPT },
  { agent: "Technical Analyst", role: "technical" as const, prompt: TECHNICAL_SYSTEM_PROMPT },
  { agent: "Macro Analyst", role: "macro" as const, prompt: MACRO_SYSTEM_PROMPT },
];

function parseStanceAndConfidence(content: string): {
  stance: string;
  confidence: number;
} {
  const match = content.match(
    /STANCE:\s*(.+?)\s*\|\s*CONFIDENCE:\s*(\d+)/i
  );
  return {
    stance: match?.[1]?.trim() || "No explicit stance",
    confidence: match ? parseInt(match[2], 10) : 50,
  };
}

function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart === -1 || braceEnd === -1) {
    throw new Error("No JSON object found in response");
  }
  return JSON.parse(raw.slice(braceStart, braceEnd + 1));
}

export async function runSession(
  sessionId: string,
  ticker: string,
  dataProvider: MarketDataProvider,
  emit: Emitter
): Promise<void> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    createSession(sessionId, ticker);
    emit({ type: "status", content: "Researching..." });
    updateSessionStatus(sessionId, "researching");

    // Step 1: Research
    const dossier = await runResearcher(client, ticker, dataProvider, emit);
    saveDossier(sessionId, dossier);
    emit({ type: "dossier", data: dossier });

    // Step 2: Debate rounds
    updateSessionStatus(sessionId, "debating");
    emit({ type: "status", content: "Debate starting..." });

    const transcript: AnalystResult[] = [];

    // Round 1 — opening arguments
    const round1 = await runAnalystRound(
      client, 1, dossier, [], emit
    );
    transcript.push(...round1);
    round1.forEach((r) =>
      saveMessage(sessionId, r.agent, 1, r.content, r.confidence)
    );

    // Subsequent rounds
    for (let round = 2; round <= config.maxRounds; round++) {
      const judgeSummary = await runJudge(client, dossier, transcript, round - 1, emit);
      saveMessage(sessionId, "Judge", round - 1, JSON.stringify(judgeSummary));
      emit({ type: "judge", round: round - 1, data: judgeSummary });

      if (judgeSummary.converged) {
        emit({ type: "status", content: "Debate converged." });
        break;
      }

      emit({ type: "status", content: `Round ${round}...` });
      const roundN = await runAnalystRound(
        client, round, dossier, transcript, emit
      );
      transcript.push(...roundN);
      roundN.forEach((r) =>
        saveMessage(sessionId, r.agent, round, r.content, r.confidence)
      );
    }

    // Step 3: Risk Manager
    updateSessionStatus(sessionId, "risking");
    emit({ type: "status", content: "Risk assessment..." });
    const riskMemo = await runRiskManager(client, dossier, transcript, emit);
    saveRiskMemo(sessionId, riskMemo);
    emit({ type: "risk_memo", data: riskMemo });

    // Step 4: Decision Maker
    updateSessionStatus(sessionId, "deciding");
    emit({ type: "status", content: "Final verdict..." });
    const verdict = await runDecisionMaker(
      client, dossier, transcript, riskMemo, emit
    );
    saveVerdict(sessionId, verdict);
    emit({ type: "verdict", data: verdict });

    updateSessionStatus(sessionId, "done");
    emit({ type: "status", content: "Complete." });
  } catch (err) {
    updateSessionStatus(sessionId, "error");
    emit({
      type: "error",
      content: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

async function runResearcher(
  client: Anthropic,
  ticker: string,
  dataProvider: MarketDataProvider,
  emit: Emitter
): Promise<Dossier> {
  emit({ type: "agent_start", agent: "Researcher" });

  const [quote, profile, ratioData, financials, peers, earnings] =
    await Promise.all([
      dataProvider.quote(ticker),
      dataProvider.profile(ticker),
      dataProvider.ratios(ticker),
      dataProvider.financials(ticker),
      dataProvider.peers(ticker),
      dataProvider.earningsCalendar(ticker),
    ]);

  const marketContext = `
MARKET DATA FOR ${ticker} (from Financial Modeling Prep API):
Quote: ${JSON.stringify(quote)}
Profile: ${JSON.stringify(profile)}
Ratios: ${JSON.stringify(ratioData)}
Financials: ${JSON.stringify(financials)}
Peers: ${JSON.stringify(peers)}
Upcoming Earnings: ${JSON.stringify(earnings)}
`;

  let fullContent = "";
  const stream = await client.messages.stream({
    model: config.models.fast,
    max_tokens: 4096,
    system: RESEARCHER_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `Research ${ticker} and produce the dossier. Here is the market data already gathered:\n${marketContext}\n\nNow use web_search for recent news, sentiment, analyst ratings, competitive positioning, and catalysts. Combine everything into the JSON dossier.`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullContent += event.delta.text;
      emit({ type: "agent_token", agent: "Researcher", content: event.delta.text });
    }
  }

  emit({ type: "agent_done", agent: "Researcher" });

  try {
    return extractJson<Dossier>(fullContent);
  } catch {
    return {
      ticker,
      generated_at: new Date().toISOString(),
      snapshot: {
        price: quote?.price,
        market_cap: quote?.marketCap ? `$${(quote.marketCap / 1e9).toFixed(1)}B` : undefined,
        pe_ratio: ratioData?.peRatio ?? undefined,
        sector: profile?.sector,
        industry: profile?.industry,
        exchange: profile?.exchange,
        fifty_two_week_high: quote?.high52w,
        fifty_two_week_low: quote?.low52w,
        avg_volume: quote?.avgVolume,
      },
      valuation: ratioData ? { ...ratioData } : {},
      fundamentals: financials ? { ...financials } : {},
      recent_news: [],
      sentiment: { bull_signals: [], bear_signals: [] },
      competitors: peers.map((p) => ({ name: p, relative_position: "peer" })),
      catalysts: earnings.map((e) => ({ event: "Earnings", date: e.date })),
      bull_facts: [],
      bear_facts: [],
      data_gaps: ["Researcher failed to produce structured JSON — using raw market data"],
    };
  }
}

async function runAnalystRound(
  client: Anthropic,
  round: number,
  dossier: Dossier,
  priorTranscript: AnalystResult[],
  emit: Emitter
): Promise<AnalystResult[]> {
  const transcriptText =
    priorTranscript.length > 0
      ? `\n\nPRIOR DEBATE TRANSCRIPT:\n${priorTranscript
          .map(
            (t) =>
              `[${t.agent} | Round ${round - 1}]\n${t.content}\n`
          )
          .join("\n---\n")}`
      : "";

  const promises = ANALYST_CONFIGS.map(async (cfg) => {
    emit({ type: "agent_start", agent: cfg.agent, round });
    let content = "";

    const userMessage =
      round === 1
        ? `Here is the research dossier. Provide your opening argument.\n\nDOSSIER:\n${JSON.stringify(dossier, null, 2)}`
        : `Here is the research dossier and the debate so far. Provide your rebuttal — engage the strongest opposing point directly.\n\nDOSSIER:\n${JSON.stringify(dossier, null, 2)}${transcriptText}`;

    const stream = await client.messages.stream({
      model: config.models.analyst,
      max_tokens: 2048,
      system: cfg.prompt,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        content += event.delta.text;
        emit({
          type: "agent_token",
          agent: cfg.agent,
          round,
          content: event.delta.text,
        });
      }
    }

    emit({ type: "agent_done", agent: cfg.agent, round });

    const { stance, confidence } = parseStanceAndConfidence(content);
    return {
      agent: cfg.agent,
      role: cfg.role,
      content,
      stance,
      confidence,
    };
  });

  return Promise.all(promises);
}

async function runJudge(
  client: Anthropic,
  dossier: Dossier,
  transcript: AnalystResult[],
  afterRound: number,
  emit: Emitter
): Promise<JudgeSummary> {
  emit({ type: "agent_start", agent: "Judge", round: afterRound });

  const transcriptText = transcript
    .map(
      (t) =>
        `[${t.agent} | Round ${Math.ceil(transcript.indexOf(t) / 4) + 1}] (Confidence: ${t.confidence})\n${t.content}`
    )
    .join("\n\n---\n\n");

  let content = "";
  const stream = await client.messages.stream({
    model: config.models.fast,
    max_tokens: 1024,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Evaluate the debate after Round ${afterRound}.\n\nDOSSIER TICKER: ${dossier.ticker}\n\nTRANSCRIPT:\n${transcriptText}`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      content += event.delta.text;
      emit({ type: "agent_token", agent: "Judge", round: afterRound, content: event.delta.text });
    }
  }

  emit({ type: "agent_done", agent: "Judge", round: afterRound });
  return extractJson<JudgeSummary>(content);
}

async function runRiskManager(
  client: Anthropic,
  dossier: Dossier,
  transcript: AnalystResult[],
  emit: Emitter
): Promise<RiskMemo> {
  emit({ type: "agent_start", agent: "Risk Manager" });

  const transcriptText = transcript
    .map((t) => `[${t.agent}] (Confidence: ${t.confidence})\n${t.content}`)
    .join("\n\n---\n\n");

  let content = "";
  const stream = await client.messages.stream({
    model: config.models.heavy,
    max_tokens: 2048,
    system: RISK_MANAGER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Assess the risk for ${dossier.ticker}.\n\nDOSSIER:\n${JSON.stringify(dossier, null, 2)}\n\nDEBATE TRANSCRIPT:\n${transcriptText}`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      content += event.delta.text;
      emit({ type: "agent_token", agent: "Risk Manager", content: event.delta.text });
    }
  }

  emit({ type: "agent_done", agent: "Risk Manager" });
  return extractJson<RiskMemo>(content);
}

async function runDecisionMaker(
  client: Anthropic,
  dossier: Dossier,
  transcript: AnalystResult[],
  riskMemo: RiskMemo,
  emit: Emitter
): Promise<Verdict> {
  emit({ type: "agent_start", agent: "Decision Maker" });

  const transcriptText = transcript
    .map((t) => `[${t.agent}] (Confidence: ${t.confidence})\n${t.content}`)
    .join("\n\n---\n\n");

  let content = "";
  const stream = await client.messages.stream({
    model: config.models.heavy,
    max_tokens: 2048,
    system: DECISION_MAKER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Make the final call on ${dossier.ticker}.\n\nDOSSIER:\n${JSON.stringify(dossier, null, 2)}\n\nDEBATE TRANSCRIPT:\n${transcriptText}\n\nRISK MEMO:\n${JSON.stringify(riskMemo, null, 2)}`,
      },
    ],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      content += event.delta.text;
      emit({ type: "agent_token", agent: "Decision Maker", content: event.delta.text });
    }
  }

  emit({ type: "agent_done", agent: "Decision Maker" });
  return extractJson<Verdict>(content);
}
