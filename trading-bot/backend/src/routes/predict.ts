import { Router } from 'express';
import { runPredict } from '../agents/predictAgent';
import { runFilter } from '../agents/filterAgent';
import { getLatestPredictions } from '../db/queries';
import { filterCache } from './filter';

const router = Router();

router.post('/run', async (_req, res) => {
  try {
    let filtered = filterCache.get();
    if (!filtered.length) { filtered = await runFilter(); filterCache.set(filtered); }
    const predictions = await runPredict(filtered as any);
    res.json({ ok: true, count: predictions.length, predictions });
  } catch (e) { res.status(500).json({ ok: false, error: (e as Error).message }); }
});

router.get('/results', (_req, res) => {
  const rows = getLatestPredictions() as any[];
  res.json({ ok: true, predictions: rows.map(r => ({
    ...r,
    feature_vector: safeParse(r.feature_vector),
    key_factors: safeParse(r.key_factors),
    risk_factors: safeParse(r.risk_factors),
  })) });
});

function safeParse(s: string) { try { return JSON.parse(s); } catch { return s; } }

export default router;
