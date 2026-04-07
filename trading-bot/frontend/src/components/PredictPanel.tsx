import { useEffect, useState } from 'react';
import { Api } from '../api/client';
import { StatRow } from './Stat';

function ProbBar({ llm, mkt }: { llm: number; mkt: number }) {
  return (
    <div className="w-48">
      <div className="flex justify-between mono text-[10px] text-white/40">
        <span>LLM {(llm * 100).toFixed(0)}%</span><span>MKT {(mkt * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded relative mt-1">
        <div className="absolute h-full bg-bull rounded" style={{ width: `${llm * 100}%` }} />
        <div className="absolute h-full w-0.5 bg-white" style={{ left: `${mkt * 100}%` }} />
      </div>
    </div>
  );
}

export default function PredictPanel() {
  const [preds, setPreds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => Api.predict.results().then(r => setPreds(r.predictions || []));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);
  const run = async () => { setLoading(true); try { await Api.predict.run(); await load(); } finally { setLoading(false); } };

  const actionable = preds.filter(p => (p.edge_score ?? 0) > 0.08).length;
  const avgEdge = preds.length ? preds.reduce((a, p) => a + (p.edge_score || 0), 0) / preds.length : 0;

  return (
    <div>
      <StatRow items={[
        { label: 'PREDICTIONS', value: preds.length },
        { label: 'ACTIONABLE', value: actionable, tone: 'bull' },
        { label: 'AVG_EDGE', value: (avgEdge * 100).toFixed(1) + '%', tone: avgEdge > 0 ? 'bull' : 'bear' },
        { label: 'MODEL', value: 'LR+LLM' },
      ]} />
      <div className="flex justify-between items-center mb-3">
        <h2 className="mono text-sm text-white/60">PREDICTION_ENGINE</h2>
        <button onClick={run} disabled={loading} className="mono text-xs px-3 py-1.5 bg-bull/20 border border-bull/40 text-bull disabled:opacity-50">
          {loading ? 'PREDICTING...' : 'RUN_PREDICT'}
        </button>
      </div>
      <div className="space-y-2 max-h-[60vh] overflow-auto">
        {preds.map((p, i) => {
          const edge = p.edge_score ?? 0;
          const color = edge > 0.08 ? 'text-bull' : edge > 0.04 ? 'text-warn' : 'text-bear';
          return (
            <div key={i} className="card p-4 flex items-center justify-between gap-4">
              <div className="mono text-bull text-sm w-20">${p.ticker}</div>
              <ProbBar llm={p.llm_probability || 0} mkt={p.market_probability || 0} />
              <div className={`mono text-lg ${color} w-24 text-right`}>{(edge * 100).toFixed(1)}%</div>
              <div className="mono text-[10px] text-white/50 flex-1 truncate">{p.rationale}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
