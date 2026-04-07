import 'dotenv/config';
import { initSchema } from '../backend/src/db/schema';
import { insertOutcome, insertAlert, insertPrediction, uid, now } from '../backend/src/db/queries';

initSchema();

const MOCK = [
  { ticker: 'NVDA', outcome: 'WIN', pnl: 6.2 },
  { ticker: 'AAPL', outcome: 'WIN', pnl: 3.4 },
  { ticker: 'TSLA', outcome: 'LOSS', pnl: -4.1 },
  { ticker: 'AMD', outcome: 'WIN', pnl: 5.8 },
  { ticker: 'META', outcome: 'WIN', pnl: 2.9 },
  { ticker: 'GOOGL', outcome: 'BREAKEVEN', pnl: 0.2 },
  { ticker: 'MSFT', outcome: 'WIN', pnl: 3.1 },
  { ticker: 'AMZN', outcome: 'LOSS', pnl: -2.8 },
  { ticker: 'SMCI', outcome: 'WIN', pnl: 11.5 },
  { ticker: 'PLTR', outcome: 'WIN', pnl: 7.4 },
  { ticker: 'COIN', outcome: 'LOSS', pnl: -6.2 },
  { ticker: 'SHOP', outcome: 'WIN', pnl: 4.0 },
  { ticker: 'SNOW', outcome: 'LOSS', pnl: -3.3 },
  { ticker: 'CRWD', outcome: 'WIN', pnl: 5.1 },
  { ticker: 'NET', outcome: 'WIN', pnl: 3.9 },
  { ticker: 'DDOG', outcome: 'BREAKEVEN', pnl: -0.1 },
  { ticker: 'UBER', outcome: 'WIN', pnl: 2.5 },
  { ticker: 'DIS', outcome: 'LOSS', pnl: -2.0 },
  { ticker: 'NFLX', outcome: 'WIN', pnl: 4.7 },
  { ticker: 'INTC', outcome: 'WIN', pnl: 3.3 },
];

const day = 24 * 60 * 60 * 1000;
let i = 0;
for (const m of MOCK) {
  const entry = 100 + Math.random() * 300;
  const exit = +(entry * (1 + m.pnl / 100)).toFixed(2);
  const ts = now() - (MOCK.length - i) * day;
  const alertId = uid();
  const predId = uid();
  insertPrediction.run(
    predId, m.ticker, JSON.stringify({ sentimentScore: 0.3 }),
    0.62, 0.5, 0.12, 'MEDIUM', JSON.stringify(['volume spike']), JSON.stringify(['IV high']),
    'Seeded prediction', entry, entry * 0.95, entry * 1.08, ts
  );
  insertAlert.run(alertId, predId, m.ticker, 'BUY', JSON.stringify({
    id: alertId, ticker: m.ticker, action: 'BUY', currentPrice: entry, edgeScore: 0.12,
    llmProbability: 0.62, marketImpliedProbability: 0.5, confidence: 'MEDIUM',
    keyFactors: ['volume spike'], riskFactors: ['IV high'], rationale: 'Seeded',
    sources: { x: 2, reddit: 3, rss: 1 }, generatedAt: new Date(ts).toISOString(),
    suggestedEntryPrice: entry, suggestedEntryRange: [entry * 0.99, entry * 1.01],
    stopLoss: entry * 0.95, targetPrice: entry * 1.08, positionSizePercent: 5, timeHorizon: '5D',
    companyName: `${m.ticker} Inc.`,
  }), ts);
  insertOutcome.run(uid(), alertId, m.ticker, entry, exit, m.outcome, m.pnl,
    `Seeded lesson: ${m.outcome} on ${m.ticker} — ${m.pnl >= 0 ? 'momentum played out' : 'thesis failed, reassess volume signal'}.`,
    'seed', ts);
  i++;
}

console.log(`[seed] inserted ${MOCK.length} mock trades`);
process.exit(0);
