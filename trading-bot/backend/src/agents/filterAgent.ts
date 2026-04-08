import { UNIVERSE } from './universe';
import { getQuotes, Quote } from '../services/marketDataService';
import { insertFiltered, uid, now, getRecentResearch } from '../db/queries';

export interface FilteredStock {
  ticker: string;
  companyName: string;
  currentPrice: number;
  volumeRatio: number;
  priorityScore: number;
  flagLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  filtersPassed: string[];
  quote: Quote;
}

export async function runFilter(): Promise<FilteredStock[]> {
  const quotes = await getQuotes(UNIVERSE);
  const research = getRecentResearch() as Array<{ ticker: string }>;
  const researchMap = new Map<string, number>();
  for (const r of research) researchMap.set(r.ticker, (researchMap.get(r.ticker) || 0) + 1);

  const results: FilteredStock[] = [];
  const ts = now();

  for (const q of quotes) {
    const passed: string[] = [];
    if (q.avgVolume20d > 500_000) passed.push('liquidity');
    if (q.volumeRatio > 1.5) passed.push('volume_spike');
    if (q.earningsDaysAway >= 0 && q.earningsDaysAway <= 14) passed.push('catalyst');
    if (q.bidAskSpreadPct < 0.5) passed.push('spread');
    if ((researchMap.get(q.ticker) || 0) >= 1) passed.push('research_signal');
    if (q.isReal) passed.push('real_data');

    if (passed.length < 2) continue;

    const priorityScore = Math.min(100,
      passed.length * 15 +
      Math.min(q.volumeRatio * 10, 30) +
      (researchMap.get(q.ticker) || 0) * 5 +
      (q.earningsDaysAway >= 0 && q.earningsDaysAway < 7 ? 15 : 0)
    );
    const flagLevel: 'HIGH' | 'MEDIUM' | 'LOW' =
      priorityScore >= 75 ? 'HIGH' : priorityScore >= 50 ? 'MEDIUM' : 'LOW';

    const fs: FilteredStock = {
      ticker: q.ticker,
      companyName: q.companyName,
      currentPrice: q.price,
      volumeRatio: q.volumeRatio,
      priorityScore: +priorityScore.toFixed(1),
      flagLevel,
      filtersPassed: passed,
      quote: q,
    };
    results.push(fs);
    insertFiltered.run(uid(), q.ticker, q.companyName, q.price, q.volumeRatio, priorityScore, flagLevel, JSON.stringify(passed), ts);
  }
  results.sort((a, b) => b.priorityScore - a.priorityScore);
  return results.slice(0, 50);
}
