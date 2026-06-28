'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './I18nProvider';

const DEFAULT_PRESETS = [
  { key: 'today', labelKey: 'sa.rangeToday' },
  { key: '7d', labelKey: 'sa.range7d' },
  { key: '30d', labelKey: 'sa.range30d' },
  { key: '90d', labelKey: 'sa.range90d' },
  { key: 'all', labelKey: 'sa.rangeAll' },
];

/**
 * Preset pills + custom from/to date inputs that drive `range`/`from`/`to` URL
 * params. Path-agnostic (works on any page) and preserves all other params.
 * A custom date clears the preset and vice-versa.
 */
export function DateRangeControls({
  defaultRange = '30d',
  presets = DEFAULT_PRESETS,
  resetCp = false,
}: {
  defaultRange?: string;
  presets?: { key: string; labelKey: string }[];
  resetCp?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const { t } = useT();
  const [pending, start] = useTransition();

  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const custom = !!(from || to);
  const range = custom ? 'custom' : (params.get('range') || defaultRange);
  const today = new Date().toISOString().slice(0, 10);

  function push(u: URLSearchParams) {
    if (resetCp) u.delete('cp');
    const qs = u.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  function setPreset(key: string) {
    const u = new URLSearchParams(params.toString());
    u.delete('from'); u.delete('to');
    if (key === defaultRange) u.delete('range'); else u.set('range', key);
    push(u);
  }
  function setDate(name: 'from' | 'to', val: string) {
    const u = new URLSearchParams(params.toString());
    u.delete('range');
    if (val) u.set(name, val); else u.delete(name);
    push(u);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((r) => (
        <button key={r.key} type="button" onClick={() => setPreset(r.key)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
          style={range === r.key
            ? { background: 'var(--brand)', color: '#fff' }
            : { background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}>
          {t(r.labelKey)}
        </button>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1"
        style={custom ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', border: '1px solid var(--border-strong)' }}>
        <input type="date" value={from} max={to || today} onChange={(e) => setDate('from', e.target.value)}
          className="bg-transparent text-xs outline-none" style={{ colorScheme: 'light' }} aria-label={t('r.from')} />
        <span className="text-xs opacity-60">–</span>
        <input type="date" value={to} max={today} min={from || undefined} onChange={(e) => setDate('to', e.target.value)}
          className="bg-transparent text-xs outline-none" style={{ colorScheme: 'light' }} aria-label={t('r.to')} />
      </span>
      {pending && <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" aria-hidden="true" />}
    </div>
  );
}
