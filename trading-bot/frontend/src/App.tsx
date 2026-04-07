import { useEffect, useState } from 'react';
import { Api } from './api/client';
import ResearchPanel from './components/ResearchPanel';
import FilterPanel from './components/FilterPanel';
import PredictPanel from './components/PredictPanel';
import AlertPanel from './components/AlertPanel';
import LearnPanel from './components/LearnPanel';

type Stage = 'research' | 'filter' | 'predict' | 'alerts' | 'learn';
const STAGES: { key: Stage; label: string }[] = [
  { key: 'research', label: '01_RESEARCH' },
  { key: 'filter', label: '02_FILTER' },
  { key: 'predict', label: '03_PREDICT' },
  { key: 'alerts', label: '04_ALERTS' },
  { key: 'learn', label: '05_LEARN' },
];

export default function App() {
  const [stage, setStage] = useState<Stage>('alerts');
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    const load = () => Api.health().then(setHealth).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  const sources = health?.sources || {};
  const Pill = ({ name, on }: { name: string; on: boolean }) => (
    <span className={`px-1.5 py-0.5 border ${on ? 'border-bull/40 text-bull' : 'border-white/10 text-white/30'}`}>{name}</span>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-bear/15 border-b border-bear/30 px-6 py-2 mono text-[11px] text-bear text-center">
        ⚠ DISCLAIMER: educational tool only. Do not trade real money on these signals.
      </div>
      <header className="border-b border-white/10 px-6 py-3 flex items-center justify-between bg-bg-surface">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-bull pulse" />
          <h1 className="mono text-lg font-semibold tracking-wider">TRADING_BOT.TERMINAL</h1>
          <span className="mono text-xs text-white/40">// v1.1</span>
        </div>
        <div className="flex items-center gap-2 mono text-[10px]">
          <Pill name="CLAUDE" on={!!sources.claude} />
          <Pill name="YAHOO" on={!!sources.yahoo} />
          <Pill name="FINNHUB" on={!!sources.finnhub} />
          <Pill name="REDDIT" on={!!sources.reddit} />
          <Pill name="X" on={!!sources.twitter} />
          <span className="text-white/40 ml-2">UP {health?.uptime ? Math.floor(health.uptime) + 's' : '—'}</span>
        </div>
      </header>

      <nav className="border-b border-white/10 px-6 bg-bg-surface flex gap-1">
        {STAGES.map(s => (
          <button
            key={s.key}
            onClick={() => setStage(s.key)}
            className={`mono text-xs px-4 py-3 border-b-2 transition ${
              stage === s.key ? 'border-bull text-white' : 'border-transparent text-white/50 hover:text-white'
            }`}
          >{s.label}</button>
        ))}
      </nav>

      <main className="flex-1 p-6">
        {stage === 'research' && <ResearchPanel />}
        {stage === 'filter' && <FilterPanel />}
        {stage === 'predict' && <PredictPanel />}
        {stage === 'alerts' && <AlertPanel />}
        {stage === 'learn' && <LearnPanel />}
      </main>
    </div>
  );
}
