import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { runFilter } from '../agents/filterAgent';
import { getLatestFiltered } from '../db/queries';

const router = Router();

let cache: any[] = [];

router.post('/run', rateLimit({ windowMs: 60_000, max: 3 }), async (_req, res) => {
  try {
    const results = await runFilter();
    cache = results;
    res.json({ ok: true, count: results.length, results });
  } catch (e) { res.status(500).json({ ok: false, error: (e as Error).message }); }
});

router.get('/results', (_req, res) => {
  res.json({ ok: true, results: cache.length ? cache : getLatestFiltered() });
});

export const filterCache = { get: () => cache, set: (r: any[]) => { cache = r; } };
export default router;
