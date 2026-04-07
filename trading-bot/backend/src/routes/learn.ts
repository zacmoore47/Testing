import { Router } from 'express';
import { insertOutcome, uid, now, getRecentOutcomes, getAllOutcomes } from '../db/queries';
import { generateLesson, retrainWeights, computeStats, TradeOutcome } from '../agents/learnAgent';

const router = Router();

router.post('/outcome', async (req, res) => {
  try {
    const body = req.body as TradeOutcome;
    const recent = getRecentOutcomes(10) as any[];
    const lesson = await generateLesson(body, recent);
    const id = uid();
    insertOutcome.run(id, body.alertId || 'manual', body.ticker, body.entryPrice, body.exitPrice,
      body.outcome, body.pnlPercent, lesson, body.notes || '', now());
    const total = (getAllOutcomes() as any[]).length;
    let retrained = false;
    if (total % 5 === 0) { retrainWeights(); retrained = true; }
    res.json({ ok: true, id, lesson, retrained });
  } catch (e) { res.status(500).json({ ok: false, error: (e as Error).message }); }
});

router.get('/outcomes', (_req, res) => {
  res.json({ ok: true, outcomes: getAllOutcomes() });
});

router.get('/stats', (_req, res) => {
  res.json({ ok: true, stats: computeStats() });
});

export default router;
