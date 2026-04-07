import { FilteredStock } from './filterAgent';
import { getResearchByTicker, insertPrediction, insertAlert, uid, now, getLatestWeights } from '../db/queries';
import { callClaudeJSON } from '../services/claudeService';
import { impliedProbability, getDetailedQuote } from '../services/marketDataService';

export interface FeatureVector {
  sentimentScore: number;
  volumeRatio: number;
  priceVsEMA20: number;
  rsiValue: number;
  earningsDaysAway: number;
  redditMentions24h: number;
  xMentions24h: number;
  newsSentiment: number;
  impliedVolatility: number;
  shortInterestRatio: number;
}

const DEFAULT_WEIGHTS = {
  bias: -0.2,
  sentimentScore: 0.9,
  volumeRatio: 0.4,
  priceVsEMA20: 1.2,
  rsiValue: -0.02,
  earningsDaysAway: -0.03,
  redditMentions24h: 0.05,
  xMentions24h: 0.04,
  newsSentiment: 0.8,
  impliedVolatility: -0.3,
  shortInterestRatio: 0.5,
};
export type Weights = typeof DEFAULT_WEIGHTS;

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)); }

export function predictLogistic(f: FeatureVector, w: Weights = DEFAULT_WEIGHTS): number {
  const z = w.bias
    + w.sentimentScore * f.sentimentScore
    + w.volumeRatio * (f.volumeRatio - 1)
    + w.priceVsEMA20 * f.priceVsEMA20
    + w.rsiValue * (f.rsiValue - 50)
    + w.earningsDaysAway * Math.max(0, f.earningsDaysAway)
    + w.redditMentions24h * Math.log(1 + f.redditMentions24h)
    + w.xMentions24h * Math.log(1 + f.xMentions24h)
    + w.newsSentiment * f.newsSentiment
    + w.impliedVolatility * f.impliedVolatility
    + w.shortInterestRatio * f.shortInterestRatio;
  return sigmoid(z);
}

export function loadWeights(): Weights {
  const row = getLatestWeights();
  if (!row) return DEFAULT_WEIGHTS;
  try { return { ...DEFAULT_WEIGHTS, ...JSON.parse(row.weights) }; }
  catch { return DEFAULT_WEIGHTS; }
}

function buildFeatures(s: FilteredStock): FeatureVector {
  const research = getResearchByTicker(s.ticker) as any[];
  const x = research.filter(r => r.source === 'x');
  const reddit = research.filter(r => r.source === 'reddit');
  const news = research.filter(r => r.source === 'rss');
  const avg = (arr: any[]) => arr.length ? arr.reduce((a, r) => a + (r.sentiment_score || 0), 0) / arr.length : 0;
  const q = s.quote;
  return {
    sentimentScore: avg(research),
    volumeRatio: q.volumeRatio,
    priceVsEMA20: (q.price - q.ema20) / q.ema20,
    rsiValue: q.rsi14,
    earningsDaysAway: q.earningsDaysAway,
    redditMentions24h: reddit.length,
    xMentions24h: x.length,
    newsSentiment: avg(news),
    impliedVolatility: q.impliedVolatility,
    shortInterestRatio: q.shortInterestRatio,
  };
}

interface LLMResult {
  probability: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  keyFactors: string[];
  riskFactors: string[];
  suggestedEntry: number;
  suggestedStopLoss: number;
  rationale: string;
}

async function llmCalibrate(ticker: string, f: FeatureVector, price: number, basePrice: number): Promise<LLMResult> {
  const fallback: LLMResult = {
    probability: +predictLogistic(f).toFixed(3),
    confidence: Math.abs(f.sentimentScore) > 0.4 ? 'HIGH' : Math.abs(f.sentimentScore) > 0.15 ? 'MEDIUM' : 'LOW',
    keyFactors: [
      f.volumeRatio > 1.5 ? `Volume ${f.volumeRatio.toFixed(2)}x avg` : 'Baseline volume',
      f.sentimentScore > 0 ? 'Bullish sentiment' : 'Mixed sentiment',
      f.priceVsEMA20 > 0 ? 'Above 20-EMA' : 'Below 20-EMA',
    ],
    riskFactors: [
      f.impliedVolatility > 0.5 ? 'Elevated IV' : 'Normal IV',
      f.earningsDaysAway >= 0 && f.earningsDaysAway < 7 ? 'Earnings risk' : 'No near catalyst',
    ],
    suggestedEntry: +(price * 0.995).toFixed(2),
    suggestedStopLoss: +(price * 0.95).toFixed(2),
    rationale: `Mock calibration: feature-based logistic output for ${ticker}.`,
  };
  return callClaudeJSON<LLMResult>(
    'You are a quantitative analyst.',
    `Given the following signals for ${ticker} (price $${price}), estimate probability the stock is higher in 5 trading days.\nFeatures: ${JSON.stringify(f)}\nReturn: { "probability": 0.XX, "confidence": "HIGH|MEDIUM|LOW", "keyFactors": ["..."], "riskFactors": ["..."], "suggestedEntry": XX.XX, "suggestedStopLoss": XX.XX, "rationale": "..." }`,
    fallback
  );
}

export async function runPredict(filtered: FilteredStock[]) {
  const weights = loadWeights();
  const top = filtered.slice(0, 15);
  // Enrich top candidates with real RSI/earnings/short interest from Yahoo + Finnhub.
  await Promise.all(top.map(async s => {
    try { s.quote = await getDetailedQuote(s.ticker); s.currentPrice = s.quote.price || s.currentPrice; }
    catch {}
  }));
  const predictions = await Promise.all(top.map(async s => {
    const f = buildFeatures(s);
    const llm = await llmCalibrate(s.ticker, f, s.currentPrice, s.currentPrice);
    const llmProb = Math.max(0.01, Math.min(0.99, llm.probability));
    const mktProb = impliedProbability(s.quote);
    const edge = +(llmProb - mktProb).toFixed(4);
    const id = uid();
    const ts = now();
    const targetPrice = +(s.currentPrice * (1 + edge * 2)).toFixed(2);
    insertPrediction.run(
      id, s.ticker, JSON.stringify(f), llmProb, mktProb, edge, llm.confidence,
      JSON.stringify(llm.keyFactors), JSON.stringify(llm.riskFactors), llm.rationale,
      llm.suggestedEntry, llm.suggestedStopLoss, targetPrice, ts
    );

    if (edge > 0.08) {
      const alert = {
        id: uid(),
        ticker: s.ticker,
        companyName: s.companyName,
        action: 'BUY' as const,
        currentPrice: s.currentPrice,
        suggestedEntryPrice: llm.suggestedEntry,
        suggestedEntryRange: [+(llm.suggestedEntry * 0.995).toFixed(2), +(llm.suggestedEntry * 1.005).toFixed(2)] as [number, number],
        stopLoss: llm.suggestedStopLoss,
        targetPrice,
        positionSizePercent: +(Math.min(10, edge * 50)).toFixed(1),
        timeHorizon: '5D' as const,
        edgeScore: edge,
        llmProbability: llmProb,
        marketImpliedProbability: mktProb,
        confidence: llm.confidence,
        keyFactors: llm.keyFactors,
        riskFactors: llm.riskFactors,
        rationale: llm.rationale,
        sources: {
          x: f.xMentions24h,
          reddit: f.redditMentions24h,
          rss: (getResearchByTicker(s.ticker) as any[]).filter(r => r.source === 'rss').length,
        },
        generatedAt: new Date(ts).toISOString(),
      };
      insertAlert.run(alert.id, id, s.ticker, alert.action, JSON.stringify(alert), ts);
    }

    return { id, ticker: s.ticker, features: f, llmProbability: llmProb, marketProbability: mktProb, edgeScore: edge, ...llm };
  }));
  return predictions;
}
