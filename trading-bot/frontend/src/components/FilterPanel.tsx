import { useEffect, useState } from 'react';
import { Api } from '../api/client';
import { StatRow } from './Stat';

export default function FilterPanel() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => Api.filter.results().then(r => setResults(r.results || []));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);
  const run = async () => { setLoading(true); try { await Api.filter.run(); await load(); } finally { setLoading(false); } };

  const high = results.filter(r => r.flagLevel === 'HIGH' || r.flag_level === 'HIGH').length;
  const med = results.filter(r => r.flagLevel === 'MEDIUM' || r.flag_level === 'MEDIUM').length;

  return (
    <div>
      <StatRow items={[
        { label: 'SCANNED', value: '300+' },
        { label: 'PASSED', value: results.length, tone: 'bull' },
        { label: 'HIGH_PRIORITY', value: high, tone: 'warn' },
        { label: 'MEDIUM', value: med },
      ]} />
      <div className="flex justify-between items-center mb-3">
        <h2 className="mono text-sm text-white/60">FILTER_RESULTS</h2>
        <button onClick={run} disabled={loading} className="mono text-xs px-3 py-1.5 bg-bull/20 border border-bull/40 text-bull disabled:opacity-50">
          {loading ? 'SCANNING...' : 'RUN_SCAN'}
        </button>
      </div>
      <div className="elevated overflow-auto max-h-[60vh]">
        <table className="w-full mono text-xs">
          <thead className="text-white/40 uppercase border-b border-white/10">
            <tr><th className="p-3 text-left">Ticker</th><th className="text-left">Company</th><th className="text-right">Price</th><th className="text-right">Vol Ratio</th><th className="text-right">Score</th><th className="text-center">Flag</th></tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const score = r.priorityScore ?? r.priority_score;
              const flag = r.flagLevel ?? r.flag_level;
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3 text-bull">${r.ticker}</td>
                  <td className="text-white/70">{r.companyName ?? r.company_name}</td>
                  <td className="text-right">${(r.currentPrice ?? r.current_price)?.toFixed(2)}</td>
                  <td className="text-right">{(r.volumeRatio ?? r.volume_ratio)?.toFixed(2)}x</td>
                  <td className="text-right">{score?.toFixed(0)}</td>
                  <td className={`text-center ${flag === 'HIGH' ? 'text-warn' : flag === 'MEDIUM' ? 'text-white' : 'text-white/40'}`}>{flag}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
