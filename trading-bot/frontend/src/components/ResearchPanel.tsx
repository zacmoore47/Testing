import { useEffect, useState } from 'react';
import { Api } from '../api/client';
import { StatRow } from './Stat';

export default function ResearchPanel() {
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => Api.research.signals().then(r => setSignals(r.signals || []));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const run = async () => { setLoading(true); try { await Api.research.run(); await load(); } finally { setLoading(false); } };

  const bySource = (src: string) => signals.filter(s => s.source === src).length;
  const bull = signals.filter(s => s.sentiment_label === 'bullish').length;

  return (
    <div>
      <StatRow items={[
        { label: 'TOTAL SIGNALS', value: signals.length },
        { label: 'X/TWITTER', value: bySource('x') },
        { label: 'REDDIT', value: bySource('reddit') },
        { label: 'BULLISH', value: bull, tone: 'bull' },
      ]} />

      <div className="flex justify-between items-center mb-3">
        <h2 className="mono text-sm text-white/60">LIVE_SIGNAL_STREAM</h2>
        <button onClick={run} disabled={loading} className="mono text-xs px-3 py-1.5 bg-bull/20 border border-bull/40 text-bull hover:bg-bull/30 disabled:opacity-50">
          {loading ? 'SCRAPING...' : 'RUN_SCRAPE'}
        </button>
      </div>

      <div className="elevated p-4 max-h-[60vh] overflow-auto">
        {signals.length === 0 && <div className="mono text-xs text-white/40">No signals yet. Run a scrape.</div>}
        {signals.map(s => (
          <div key={s.id} className="py-2 border-b border-white/5 flex items-start gap-3">
            <span className="mono text-xs text-white/40 w-12 uppercase">{s.source}</span>
            <span className="mono text-xs text-bull w-16">${s.ticker}</span>
            <span className={`mono text-[10px] w-16 ${s.sentiment_label === 'bullish' ? 'text-bull' : s.sentiment_label === 'bearish' ? 'text-bear' : 'text-white/40'}`}>{s.sentiment_label}</span>
            <span className="mono text-xs text-white/70 flex-1">{s.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
