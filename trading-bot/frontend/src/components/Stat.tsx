export function StatRow({ items }: { items: { label: string; value: string | number; tone?: 'bull' | 'bear' | 'warn' | 'neutral' }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((it, i) => (
        <div key={i} className="card p-4">
          <div className="mono text-[10px] uppercase tracking-wider text-white/40">{it.label}</div>
          <div className={`mono text-2xl mt-1 ${
            it.tone === 'bull' ? 'text-bull' : it.tone === 'bear' ? 'text-bear' : it.tone === 'warn' ? 'text-warn' : 'text-white'
          }`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
