import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { initSchema } from './db/schema';
import research from './routes/research';
import filter from './routes/filter';
import predict from './routes/predict';
import alerts from './routes/alerts';
import learn from './routes/learn';
import { runResearch, lastRun } from './agents/researchAgent';
import { runFilter } from './agents/filterAgent';
import { runPredict } from './agents/predictAgent';
import { filterCache } from './routes/filter';

initSchema();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

const agentStatus = {
  research: { lastRun: 0, status: 'idle' as 'idle' | 'running' | 'error' },
  filter: { lastRun: 0, status: 'idle' },
  predict: { lastRun: 0, status: 'idle' },
  learn: { lastRun: 0, status: 'idle' },
};

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    agents: agentStatus,
    sources: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      yahoo: true,
      finnhub: !!process.env.FINNHUB_API_KEY,
      reddit: !!process.env.REDDIT_CLIENT_ID,
      twitter: !!process.env.TWITTER_BEARER_TOKEN,
    },
    claudeEnabled: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.use('/api/research', research);
app.use('/api/filter', filter);
app.use('/api/predict', predict);
app.use('/api/alerts', alerts);
app.use('/api/learn', learn);

// Periodic runs
cron.schedule('*/15 * * * *', async () => {
  try {
    agentStatus.research.status = 'running';
    await runResearch();
    agentStatus.research.lastRun = Date.now();
    agentStatus.research.status = 'idle';

    agentStatus.filter.status = 'running';
    const filtered = await runFilter();
    filterCache.set(filtered);
    agentStatus.filter.lastRun = Date.now();
    agentStatus.filter.status = 'idle';

    agentStatus.predict.status = 'running';
    await runPredict(filtered);
    agentStatus.predict.lastRun = Date.now();
    agentStatus.predict.status = 'idle';
  } catch (e) { console.error('[cron]', e); }
});

const port = parseInt(process.env.PORT || '3001', 10);
app.listen(port, () => {
  console.log(`[backend] listening on :${port}`);
  console.log(`[backend] Claude: ${process.env.ANTHROPIC_API_KEY ? 'ENABLED' : 'MOCK'}`);
});
