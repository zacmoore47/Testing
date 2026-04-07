import { Router } from 'express';
import { runResearch, lastRun } from '../agents/researchAgent';
import { getRecentResearch } from '../db/queries';

const router = Router();

router.post('/run', async (_req, res) => {
  try {
    const results = await runResearch();
    lastRun.research = Date.now();
    res.json({ ok: true, count: results.length, signals: results });
  } catch (e) { res.status(500).json({ ok: false, error: (e as Error).message }); }
});

router.get('/signals', (_req, res) => {
  res.json({ ok: true, signals: getRecentResearch() });
});

export default router;
