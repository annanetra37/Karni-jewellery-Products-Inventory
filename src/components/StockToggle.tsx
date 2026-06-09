'use client';
import { useT } from './I18nProvider';

type Stock = 'all' | 'in' | 'out';

const OPTIONS: { key: Stock; label: string }[] = [
  { key: 'all', label: 'c.stockAll' },
  { key: 'in', label: 'c.stockIn' },
  { key: 'out', label: 'c.stockOut' },
];

/** Segmented in-stock / out-of-stock toggle — replaces the stock dropdown. */
export function StockToggle({ value, onChange }: { value: Stock; onChange: (v: Stock) => void }) {
  const { t } = useT();
  return (
    <div className="inline-flex rounded-full p-0.5 gap-0.5"
      style={{ background: 'var(--bg-tint)', border: '1px solid var(--border-strong)' }}
      role="group" aria-label={t('c.stock')}>
      {OPTIONS.map((o) => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)}
            aria-pressed={active}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap"
            style={active ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--ink)' }}>
            {t(o.label)}
          </button>
        );
      })}
    </div>
  );
}
