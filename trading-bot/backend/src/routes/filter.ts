import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { runFilter } from '../agents/filterAgent';
import { getLatestFiltered } from '../db/queries';

const router = Router();

let cache: any[] = [];

router.post('/run', rateLimit({ windowMs: 60_000, max: 3 }), async (_req, res) => {
  try {
    console.log('[filter] /run triggered');
    const results = await runFilter();
    cache = results;
    console.log(`[filter] returning ${results.length} results`);
    res.json({ ok: true, count: results.length, results });
  } catch (e) {
    console.error('[filter] error:', e);
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

router.get('/results', (_req, res) => {
  res.json({ ok: true, results: cache.length ? cache : getLatestFiltered() });
});

export const filterCache = { get: () => cache, set: (r: any[]) => { cache = r; } };
export default router;
