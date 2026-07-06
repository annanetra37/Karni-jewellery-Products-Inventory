'use client';

import { useRef, useState } from 'react';

/**
 * Combo chart: revenue bars (left axis) with a period-over-period growth-%
 * line overlaid on a secondary right axis, plus a % label above each point.
 * Used for the month-on-month / week-on-week trends. Hovering (or touching)
 * reveals the exact revenue and growth for a period.
 */
export function GrowthBarLineChart({
  data, unit = '', height = 190,
}: {
  data: { label: string; value: number; growth: number | null }[];
  unit?: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>—</p>;
  }

  const W = 620;
  const H = height;
  const pad = { top: 22, right: 44, bottom: 26, left: 50 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const n = data.length;
  const band = innerW / n;
  const barW = Math.min(40, band * 0.62);

  const maxV = Math.max(...data.map((d) => d.value), 1);
  const growths = data.map((d) => d.growth).filter((g): g is number => g != null);
  const maxG = Math.max(0, ...growths);
  const minG = Math.min(0, ...growths);
  const gPad = (maxG - minG) * 0.15 || 5;
  const gTop = maxG + gPad;
  const gBot = minG - gPad;
  const gRange = gTop - gBot || 1;

  const xCenter = (i: number) => pad.left + band * i + band / 2;
  const yVal = (v: number) => pad.top + innerH * (1 - v / maxV);
  const yG = (g: number) => pad.top + innerH * (1 - (g - gBot) / gRange);

  const compact = (v: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const full = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v) + (unit ? ` ${unit}` : '');

  const gPoints = data.map((d, i) => (d.growth == null ? null : { x: xCenter(i), y: yG(d.growth), g: d.growth, i }))
    .filter((p): p is { x: number; y: number; g: number; i: number } => p != null);
  const gPath = gPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const leftTicks = [0, 0.5, 1].map((t) => ({ v: maxV * t, y: pad.top + innerH * (1 - t) }));
  const zeroInRange = gBot < 0 && gTop > 0;

  function locate(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const i = Math.floor((svgX - pad.left) / band);
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const hd = hover != null ? data[hover] : null;
  const tipLeft = hover != null ? `${(xCenter(hover) / W) * 100}%` : '0';

  return (
    <div ref={wrapRef} className="relative w-full"
      onMouseMove={(e) => locate(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => locate(e.touches[0].clientX)}
      onTouchMove={(e) => locate(e.touches[0].clientX)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} preserveAspectRatio="xMidYMid meet">
        {/* left (revenue) gridlines + labels */}
        {leftTicks.map((tk, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={tk.y} y2={tk.y} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={pad.left - 6} y={tk.y + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--ink-faint)' }}>{compact(Math.round(tk.v))}</text>
          </g>
        ))}
        {/* right (growth) axis labels */}
        {[gTop, zeroInRange ? 0 : (gTop + gBot) / 2, gBot].map((g, i) => (
          <text key={i} x={W - pad.right + 6} y={yG(g) + 3} textAnchor="start" style={{ fontSize: 9, fill: 'var(--accent-deep)' }}>{g >= 0 ? '' : '−'}{Math.abs(Math.round(g))}%</text>
        ))}
        {zeroInRange && <line x1={pad.left} x2={W - pad.right} y1={yG(0)} y2={yG(0)} stroke="var(--accent-deep)" strokeWidth="0.75" strokeDasharray="1 3" opacity="0.5" />}

        {/* bars */}
        {data.map((d, i) => {
          const x = xCenter(i) - barW / 2;
          const y = yVal(d.value);
          const active = hover === i;
          return (
            <rect key={i} x={x} y={y} width={barW} height={pad.top + innerH - y} rx="3"
              fill={active ? 'var(--brand-deep)' : 'var(--brand)'} opacity={active ? 1 : 0.85} />
          );
        })}

        {/* growth line + points + % labels */}
        {gPoints.length > 1 && <path d={gPath} fill="none" stroke="var(--accent-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {gPoints.map((p) => (
          <g key={p.i}>
            <circle cx={p.x} cy={p.y} r={hover === p.i ? 4 : 3} fill="var(--accent-deep)" stroke="#fff" strokeWidth="1" />
            <text x={p.x} y={p.y - 7} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fill: 'var(--accent-deep)' }}>
              {p.g >= 0 ? '+' : '−'}{Math.abs(p.g).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* x labels (thinned to avoid overlap) */}
        {data.map((d, i) => {
          const every = Math.max(1, Math.ceil(n / 8));
          if (i % every !== 0 && i !== n - 1) return null;
          return <text key={i} x={xCenter(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--ink-soft)' }}>{d.label}</text>;
        })}
      </svg>
      {hd && (
        <div className="pointer-events-none absolute -translate-x-1/2 px-2.5 py-1.5 rounded-lg shadow-lift text-xs whitespace-nowrap"
          style={{ left: tipLeft, top: 0, background: 'var(--brand-deep)', color: '#f4ecd9' }}>
          <div className="font-semibold tabular-nums">{full(hd.value)}</div>
          {hd.growth != null && <div className="tabular-nums" style={{ color: 'var(--accent)' }}>{hd.growth >= 0 ? '▲' : '▼'} {Math.abs(hd.growth).toFixed(1)}%</div>}
          <div style={{ opacity: 0.75 }}>{hd.label}</div>
        </div>
      )}
    </div>
  );
}
