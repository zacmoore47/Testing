import { callClaudeJSON } from './claudeService';

export interface SentimentResult {
  score: number;    // -1..1
  label: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

const BULLISH = /\b(beat|beats|surge|rally|breakout|moon|squeeze|upgrade|buy|bullish|strong|record|approved|soar)\b/i;
const BEARISH = /\b(miss|misses|plunge|crash|downgrade|sell|bearish|weak|lawsuit|probe|recall|drop|fall)\b/i;

export function mockSentiment(text: string): SentimentResult {
  const b = (text.match(BULLISH) || []).length;
  const s = (text.match(BEARISH) || []).length;
  const score = Math.max(-1, Math.min(1, (b - s) / 3));
  const label = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';
  return { score, label, confidence: Math.min(1, Math.abs(score) + 0.4) };
}

export async function scoreBatch(texts: string[]): Promise<SentimentResult[]> {
  if (!process.env.ANTHROPIC_API_KEY) return texts.map(mockSentiment);
  const fallback = { results: texts.map(mockSentiment) };
  const out = await callClaudeJSON<{ results: SentimentResult[] }>(
    'You are a financial sentiment analyzer. Score each input as bullish, bearish, or neutral with confidence.',
    `Score these ${texts.length} snippets. Respond as {"results":[{"score":-1..1,"label":"bullish|bearish|neutral","confidence":0..1}, ...]}:\n\n${texts.map((t, i) => `[${i}] ${t}`).join('\n')}`,
    fallback
  );
  return out.results || fallback.results;
}
