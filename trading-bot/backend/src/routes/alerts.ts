import { Router } from 'express';
import { getLatestAlerts, getAlertHistory } from '../db/queries';

const router = Router();

function parse(rows: any[]) {
  return rows.map(r => ({ ...r, full_alert: safeParse(r.full_alert) }));
}
function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }

router.get('/latest', (_req, res) => {
  res.json({ ok: true, alerts: parse(getLatestAlerts() as any[]).map(r => r.full_alert).filter(Boolean) });
});

router.get('/history', (req, res) => {
  const limit = Math.min(200, parseInt((req.query.limit as string) || '50', 10));
  const offset = parseInt((req.query.offset as string) || '0', 10);
  res.json({ ok: true, alerts: parse(getAlertHistory(limit, offset) as any[]).map(r => r.full_alert).filter(Boolean) });
});

export default router;
