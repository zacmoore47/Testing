import { useEffect, useState } from 'react';
import { Api } from '../api/client';
import { StatRow } from './Stat';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function LearnPanel() {
  const [stats, setStats] = useState<any>(null);
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [form, setForm] = useState({ ticker: '', entryPrice: '', exitPrice: '', outcome: 'WIN', notes: '' });
  const [msg, setMsg] = useState('');

  const load = () => Promise.all([Api.learn.stats(), Api.learn.outcomes()]).then(([s, o]) => {
    setStats(s.stats); setOutcomes(o.outcomes || []);
  });
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry = parseFloat(form.entryPrice);
    const exit = parseFloat(form.exitPrice);
    const pnl = ((exit - entry) / entry) * 100;
    const r = await Api.learn.submit({
      alertId: 'manual', ticker: form.ticker.toUpperCase(),
      entryPrice: entry, exitPrice: exit, outcome: form.outcome,
      pnlPercent: pnl, notes: form.notes,
    });
    setMsg(r.lesson);
    setForm({ ticker: '', entryPrice: '', exitPrice: '', outcome: 'WIN', notes: '' });
    load();
  };

  const trendData = (stats?.modelAccuracyTrend || []).map((v: number, i: number) => ({ i: i + 1, winRate: v * 100 }));

  return (
    <div>
      <StatRow items={[
        { label: 'TOTAL_TRADES', value: stats?.totalTrades ?? 0 },
        { label: 'WIN_RATE', value: ((stats?.winRate ?? 0) * 100).toFixed(1) + '%', tone: 'bull' },
        { label: 'AVG_PNL', value: (stats?.avgPnl ?? 0).toFixed(2) + '%', tone: (stats?.avgPnl ?? 0) > 0 ? 'bull' : 'bear' },
        { label: 'EDGE_ACCURACY', value: ((stats?.avgEdgeAccuracy ?? 0) * 100).toFixed(0) + '%', tone: 'warn' },
      ]} />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h3 className="mono text-xs text-white/60 mb-3">WIN_RATE_TREND (LAST 20)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="i" stroke="#888" fontSize={10} />
              <YAxis stroke="#888" fontSize={10} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#151b22', border: '1px solid rgba(255,255,255,0.1)' }} />
              <Line type="monotone" dataKey="winRate" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-4">
          <h3 className="mono text-xs text-white/60 mb-3">SUBMIT_TRADE_OUTCOME</h3>
          <form onSubmit={submit} className="space-y-2 mono text-xs">
            <input required placeholder="TICKER" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value })} className="w-full bg-bg-elevated border border-white/10 p-2 text-white" />
            <div className="grid grid-cols-2 gap-2">
              <input required type="number" step="0.01" placeholder="Entry" value={form.entryPrice} onChange={e => setForm({ ...form, entryPrice: e.target.value })} className="bg-bg-elevated border border-white/10 p-2 text-white" />
              <input required type="number" step="0.01" placeholder="Exit" value={form.exitPrice} onChange={e => setForm({ ...form, exitPrice: e.target.value })} className="bg-bg-elevated border border-white/10 p-2 text-white" />
            </div>
            <div className="flex gap-1">
              {['WIN', 'LOSS', 'BREAKEVEN'].map(o => (
                <button type="button" key={o} onClick={() => setForm({ ...form, outcome: o })}
                  className={`flex-1 p-2 border ${form.outcome === o ? (o === 'WIN' ? 'border-bull text-bull bg-bull/10' : o === 'LOSS' ? 'border-bear text-bear bg-bear/10' : 'border-warn text-warn bg-warn/10') : 'border-white/10 text-white/50'}`}>{o}</button>
              ))}
            </div>
            <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-bg-elevated border border-white/10 p-2 text-white" />
            <button className="w-full p-2 bg-bull/20 border border-bull/40 text-bull">SUBMIT_OUTCOME</button>
          </form>
          {msg && <div className="mt-3 p-2 border border-warn/30 text-warn mono text-[10px]">LESSON: {msg}</div>}
        </div>
      </div>

      <div className="elevated p-4 max-h-[40vh] overflow-auto">
        <h3 className="mono text-xs text-white/60 mb-3">TRADE_HISTORY</h3>
        <table className="w-full mono text-xs">
          <thead className="text-white/40 text-[10px] uppercase"><tr>
            <th className="text-left p-1">Ticker</th><th className="text-right">Entry</th><th className="text-right">Exit</th><th className="text-right">PnL</th><th className="text-center">Result</th><th className="text-left pl-4">Lesson</th>
          </tr></thead>
          <tbody>
            {outcomes.map((o, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="p-1 text-bull">${o.ticker}</td>
                <td className="text-right">${o.entry_price?.toFixed(2)}</td>
                <td className="text-right">${o.exit_price?.toFixed(2)}</td>
                <td className={`text-right ${o.pnl_percent > 0 ? 'text-bull' : o.pnl_percent < 0 ? 'text-bear' : 'text-white/40'}`}>{o.pnl_percent?.toFixed(2)}%</td>
                <td className={`text-center ${o.outcome === 'WIN' ? 'text-bull' : o.outcome === 'LOSS' ? 'text-bear' : 'text-warn'}`}>{o.outcome}</td>
                <td className="pl-4 text-white/60 text-[10px] truncate max-w-md">{o.lesson}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
