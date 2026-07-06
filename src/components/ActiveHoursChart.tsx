'use client';

import { useRef, useState } from 'react';

const hourLabel = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${hh < 12 ? 'am' : 'pm'}`;
};

/**
 * Per-weekday view of the shop's active selling times in Yerevan hours. For each
 * weekday a vertical band spans the typical first→last sale hour (the window the
 * shop is busy), and a connected line marks the busiest hour across the week.
 * Hovering shows the exact open–close window, busiest hour and average active
 * hours for that weekday.
 */
export function ActiveHoursChart({
  data, height = 210,
}: {
  data: { label: string; open: number | null; peak: number | null; close: number | null; avgHours: number }[];
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (!data.some((d) => d.open != null)) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>—</p>;
  }

  const W = 620;
  const H = height;
  const pad = { top: 14, right: 14, bottom: 24, left: 46 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const n = data.length;
  const band = innerW / n;
  const barW = Math.min(30, band * 0.5);
  const yH = (h: number) => pad.top + innerH * (1 - h / 24);
  const xCenter = (i: number) => pad.left + band * i + band / 2;

  const peakPts = data.map((d, i) => (d.peak == null ? null : { x: xCenter(i), y: yH(d.peak + 0.5), i }))
    .filter((p): p is { x: number; y: number; i: number } => p != null);
  const peakPath = peakPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const yTicks = [0, 6, 12, 18, 24];

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
        {yTicks.map((h) => (
          <g key={h}>
            <line x1={pad.left} x2={W - pad.right} y1={yH(h)} y2={yH(h)} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={pad.left - 6} y={yH(h) + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--ink-faint)' }}>{hourLabel(h)}</text>
          </g>
        ))}
        {/* active-window bands (first → last sale hour) */}
        {data.map((d, i) => {
          if (d.open == null || d.close == null) return null;
          const top = yH(d.close + 1);
          const bottom = yH(d.open);
          const active = hover === i;
          return (
            <rect key={i} x={xCenter(i) - barW / 2} y={top} width={barW} height={Math.max(2, bottom - top)} rx="4"
              fill={active ? 'var(--brand-deep)' : 'var(--accent-soft)'} opacity={active ? 0.85 : 0.9}
              stroke="var(--brand)" strokeWidth={active ? 1.5 : 0.75} />
          );
        })}
        {/* busiest-hour line */}
        {peakPts.length > 1 && <path d={peakPath} fill="none" stroke="var(--accent-deep)" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />}
        {peakPts.map((p) => (
          <circle key={p.i} cx={p.x} cy={p.y} r={hover === p.i ? 4.5 : 3.2} fill="var(--accent-deep)" stroke="#fff" strokeWidth="1" />
        ))}
        {data.map((d, i) => (
          <text key={i} x={xCenter(i)} y={H - 8} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--ink-soft)' }}>{d.label}</text>
        ))}
      </svg>
      {hd && (
        <div className="pointer-events-none absolute -translate-x-1/2 px-2.5 py-1.5 rounded-lg shadow-lift text-xs whitespace-nowrap"
          style={{ left: tipLeft, top: 0, background: 'var(--brand-deep)', color: '#f4ecd9' }}>
          {hd.open != null && hd.close != null ? (
            <>
              <div className="font-semibold tabular-nums">{hourLabel(hd.open)} – {hourLabel(hd.close + 1)}</div>
              {hd.peak != null && <div className="tabular-nums" style={{ color: 'var(--accent)' }}>busiest {hourLabel(hd.peak)}</div>}
              <div style={{ opacity: 0.75 }}>{hd.label} · ~{hd.avgHours}h active</div>
            </>
          ) : (
            <div style={{ opacity: 0.75 }}>{hd.label} · —</div>
          )}
        </div>
      )}
    </div>
  );
}
