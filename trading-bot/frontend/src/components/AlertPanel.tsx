import { useEffect, useState } from 'react';
import { Api } from '../api/client';
import { StatRow } from './Stat';

export default function AlertPanel() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const load = () => Api.alerts.latest().then(r => setAlerts(r.alerts || []));
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const copy = (a: any) => {
    const text = `${a.ticker} ${a.action} @ $${a.suggestedEntryPrice} | Stop: $${a.stopLoss} | Target: $${a.targetPrice} | Edge: ${(a.edgeScore * 100).toFixed(1)}%`;
    navigator.clipboard.writeText(text);
  };

  const high = alerts.filter(a => a.edgeScore > 0.12).length;
  const avgEdge = alerts.length ? alerts.reduce((a, x) => a + x.edgeScore, 0) / alerts.length : 0;

  return (
    <div>
      <StatRow items={[
        { label: 'ACTIVE_ALERTS', value: alerts.length, tone: 'bull' },
        { label: 'HIGH_CONVICTION', value: high, tone: 'warn' },
        { label: 'AVG_EDGE', value: (avgEdge * 100).toFixed(1) + '%', tone: 'bull' },
        { label: 'REFRESH', value: '30s' },
      ]} />
      <h2 className="mono text-sm text-white/60 mb-3">TRADE_ALERTS</h2>
      {alerts.length === 0 && <div className="mono text-xs text-white/40 elevated p-4">No active alerts. Run predict to generate.</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {alerts.map(a => {
          const edge = a.edgeScore;
          const edgeColor = edge > 0.12 ? 'text-bull' : edge > 0.08 ? 'text-warn' : 'text-bear';
          return (
            <div key={a.id} className="card p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="mono text-xl text-bull">${a.ticker}</div>
                  <div className="text-xs text-white/50">{a.companyName}</div>
                </div>
                <div className="text-right">
                  <div className={`mono text-3xl ${edgeColor}`}>{(edge * 100).toFixed(1)}%</div>
                  <div className="mono text-[10px] text-white/40">EDGE</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mono text-xs">
                <div className="elevated p-2"><div className="text-white/40 text-[10px]">ENTRY</div><div className="text-white">${a.suggestedEntryPrice?.toFixed(2)}</div></div>
                <div className="elevated p-2"><div className="text-white/40 text-[10px]">STOP</div><div className="text-bear">${a.stopLoss?.toFixed(2)}</div></div>
                <div className="elevated p-2"><div className="text-white/40 text-[10px]">TARGET</div><div className="text-bull">${a.targetPrice?.toFixed(2)}</div></div>
                <div className="elevated p-2"><div className="text-white/40 text-[10px]">SIZE</div><div className="text-white">{a.positionSizePercent}%</div></div>
              </div>

              <div className="mono text-[10px] text-white/50 leading-relaxed">{a.rationale}</div>

              <div className="flex gap-1 flex-wrap">
                {a.keyFactors?.map((f: string, i: number) => (
                  <span key={i} className="text-[10px] mono px-2 py-0.5 border border-bull/30 text-bull/80">{f}</span>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <div className="mono text-[10px] text-white/40">
                  X:{a.sources?.x || 0} · R:{a.sources?.reddit || 0} · N:{a.sources?.rss || 0} · {a.confidence}
                </div>
                <button onClick={() => copy(a)} className="mono text-[10px] px-2 py-1 border border-white/20 hover:bg-white/5">COPY</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
