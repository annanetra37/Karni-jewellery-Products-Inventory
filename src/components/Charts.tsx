// Lightweight inline-SVG / CSS-bar chart primitives. No deps.
type Datum = { label: string; value: number; sub?: string };

const PALETTE = [
  'var(--brand)', 'var(--accent)', 'var(--gold)', 'var(--brand-soft)',
  'var(--accent-deep)', '#7a5a2c', '#7aa180', '#cc645c', '#3a6646', '#8c5d3a',
];

export function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{label}</p>
      <p className="display text-3xl font-semibold mt-1" style={{ color: 'var(--brand-deep)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>{sub}</p>}
    </div>
  );
}

export function BarChart({ data, valueLabel, max }: { data: Datum[]; valueLabel?: (n: number) => string; max?: number }) {
  if (data.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>—</p>;
  }
  const m = max ?? Math.max(...data.map((d) => d.value), 1);
  const fmt = valueLabel ?? ((n: number) => n.toLocaleString());
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="flex justify-between items-baseline text-xs mb-1 gap-2">
            <span className="font-medium truncate" style={{ color: 'var(--ink)' }}>{d.label}</span>
            <span className="font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
              {fmt(d.value)}{d.sub ? <span className="opacity-60"> · {d.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tint)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${(d.value / m) * 100}%`, background: PALETTE[i % PALETTE.length] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DonutChart({ slices, total, label }: { slices: Datum[]; total: number; label?: string }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const visible = slices.filter((s) => s.value > 0);
  if (visible.length === 0 || total === 0) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>—</p>;
  }
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0 -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-tint)" strokeWidth="20" />
        {visible.map((s, i) => {
          const len = (s.value / total) * c;
          const dash = `${len} ${c - len}`;
          const dashoffset = -offset;
          offset += len;
          return (
            <circle key={s.label} cx="80" cy="80" r={r} fill="none"
              stroke={PALETTE[i % PALETTE.length]} strokeWidth="20"
              strokeDasharray={dash} strokeDashoffset={dashoffset} strokeLinecap="butt" />
          );
        })}
        <text x="80" y="78" textAnchor="middle" className="display" transform="rotate(90 80 80)"
          style={{ fill: 'var(--brand-deep)', fontWeight: 600, fontSize: 18 }}>
          {visible.length}
        </text>
        <text x="80" y="92" textAnchor="middle" transform="rotate(90 80 80)"
          style={{ fill: 'var(--ink-soft)', fontSize: 10, letterSpacing: 0.5 }}>
          {label || ''}
        </text>
      </svg>
      <ul className="flex-1 space-y-1 w-full">
        {visible.map((s, i) => {
          const pct = ((s.value / total) * 100).toFixed(1);
          return (
            <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }}></span>
                <span className="truncate font-medium" style={{ color: 'var(--ink)' }}>{s.label}</span>
              </span>
              <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
                {s.value.toLocaleString()} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
