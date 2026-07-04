'use client';

import { useRef, useState } from 'react';

/**
 * Time-series area chart with a hover tooltip. Client component so callers pass
 * a serializable `unit` (not a formatter function). Hovering — or touching on
 * mobile — reveals the exact value and label at the nearest point.
 *
 * An optional `overlay` series (same length/labels as `series`, matched by
 * index) is drawn as a dashed line with no fill — used for a rolling average or
 * trend line. When present, a small legend names both lines and the tooltip
 * shows both values.
 */
export function LineChartHover({
  series, overlay, seriesLabel, overlayLabel, unit = '', height = 160,
}: {
  series: { label: string; value: number }[];
  overlay?: { label: string; value: number }[];
  seriesLabel?: string;
  overlayLabel?: string;
  unit?: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (series.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>—</p>;
  }

  const W = 600;
  const H = height;
  const pad = { top: 12, right: 12, bottom: 24, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const hasOverlay = !!overlay && overlay.length === series.length;
  const max = Math.max(...series.map((p) => p.value), ...(hasOverlay ? overlay!.map((p) => p.value) : []), 1);
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + (unit ? ` ${unit}` : '');

  const xy = (arr: { label: string; value: number }[]) => arr.map((p, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + innerH * (1 - p.value / max),
    ...p,
  }));
  const points = xy(series);
  const overlayPts = hasOverlay ? xy(overlay!) : [];
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const overlayPath = overlayPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`;
  const yTicks = [0, 0.5, 1].map((t) => ({ v: max * t, y: pad.top + innerH * (1 - t) }));

  function locate(clientX: number) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;     // 0..1 across the container
    const svgX = frac * W;                               // back to viewBox coords
    const i = Math.round((svgX - pad.left) / stepX);
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  }

  const hp = hover != null ? points[hover] : null;
  const ho = hover != null && hasOverlay ? overlayPts[hover] : null;
  const tipLeft = hp ? `${(hp.x / W) * 100}%` : '0';

  return (
    <div className="w-full">
      {hasOverlay && (seriesLabel || overlayLabel) && (
        <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 12, height: 3, background: 'var(--brand)' }} />
            {seriesLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 12, height: 0, borderTop: '2px dashed var(--accent-deep)' }} />
            {overlayLabel}
          </span>
        </div>
      )}
      <div ref={wrapRef} className="relative w-full"
        onMouseMove={(e) => locate(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => locate(e.touches[0].clientX)}
        onTouchMove={(e) => locate(e.touches[0].clientX)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ minHeight: H }}>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={pad.left} x2={W - pad.right} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="2 4" />
              <text x={pad.left - 6} y={t.y + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--ink-faint)' }}>{fmt(Math.round(t.v))}</text>
            </g>
          ))}
          <path d={area} fill="var(--accent-soft)" opacity="0.55" />
          <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {hasOverlay && <path d={overlayPath} fill="none" stroke="var(--accent-deep)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />}
          {hp && <line x1={hp.x} x2={hp.x} y1={pad.top} y2={pad.top + innerH} stroke="var(--brand)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />}
          {points.map((p) => (
            <circle key={`${p.label}-${p.x}`} cx={p.x} cy={p.y} r={hp && hp.label === p.label ? 4 : 2.5}
              fill={hp && hp.label === p.label ? 'var(--accent-deep)' : 'var(--brand)'} />
          ))}
          {ho && <circle cx={ho.x} cy={ho.y} r={4} fill="var(--accent-deep)" stroke="#fff" strokeWidth="1" />}
          {points.map((p, i) => {
            const every = Math.max(1, Math.ceil(points.length / 8));
            if (i % every !== 0 && i !== points.length - 1) return null;
            return (
              <text key={`${p.label}-x`} x={p.x} y={H - 6} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--ink-soft)' }}>{p.label}</text>
            );
          })}
        </svg>
        {hp && (
          <div className="pointer-events-none absolute -translate-x-1/2 px-2.5 py-1.5 rounded-lg shadow-lift text-xs whitespace-nowrap"
            style={{ left: tipLeft, top: 0, background: 'var(--brand-deep)', color: '#f4ecd9' }}>
            <div className="font-semibold tabular-nums">{fmt(hp.value)}</div>
            {ho && <div className="tabular-nums" style={{ color: 'var(--accent)' }}>{overlayLabel}: {fmt(Math.round(ho.value))}</div>}
            <div style={{ opacity: 0.75 }}>{hp.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
