'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './I18nProvider';
import { MultiSelectDropdown } from './MultiSelectDropdown';

const splitParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function SalesAnalyticsFilters({
  sellingPoints, salespeople,
}: {
  sellingPoints: { id: string; name: string }[];
  salespeople: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useT();
  const [pending, start] = useTransition();

  function push(next: URLSearchParams) {
    const qs = next.toString();
    start(() => router.replace(qs ? `/admin/sales-analytics?${qs}` : '/admin/sales-analytics', { scroll: false }));
  }

  function setMulti(name: string, values: string[]) {
    const u = new URLSearchParams(params.toString());
    if (values.length > 0) u.set(name, values.join(','));
    else u.delete(name);
    push(u);
  }
  function setRange(r: string) {
    const u = new URLSearchParams(params.toString());
    if (r === '30d') u.delete('range'); else u.set('range', r);
    push(u);
  }

  const range = params.get('range') || '30d';
  const selSp = splitParam(params.get('sellingPointId'));
  const selPerson = splitParam(params.get('soldById'));
  const selPay = splitParam(params.get('paymentMethod'));

  const anyActive = selSp.length > 0 || selPerson.length > 0 || selPay.length > 0 || range !== '30d';

  const ranges: { key: string; label: string }[] = [
    { key: 'today', label: t('sa.rangeToday') },
    { key: '7d', label: t('sa.range7d') },
    { key: '30d', label: t('sa.range30d') },
    { key: '90d', label: t('sa.range90d') },
    { key: 'all', label: t('sa.rangeAll') },
  ];

  // Selling-point options for multi-select use names but URL stores ids — map back.
  const spIdToName = new Map(sellingPoints.map((s) => [s.id, s.name]));
  const spNameToId = new Map(sellingPoints.map((s) => [s.name, s.id]));
  const selSpNames = selSp.map((id) => spIdToName.get(id) || id);
  const personIdToName = new Map(salespeople.map((u) => [u.id, u.fullName]));
  const personNameToId = new Map(salespeople.map((u) => [u.fullName, u.id]));
  const selPersonNames = selPerson.map((id) => personIdToName.get(id) || id);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--brand-deep)' }}>
          {t('an.filters')}
          {pending && <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" aria-hidden="true" />}
        </p>
        <button
          type="button"
          onClick={() => push(new URLSearchParams())}
          disabled={!anyActive}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--brand)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 2v6h6" />
            <path d="M3.51 9a9 9 0 1 0 2.13-3.36L3 8" />
          </svg>
          {t('c.reset')}
        </button>
      </div>

      {/* Date range pill bar */}
      <div className="flex flex-wrap gap-1.5">
        {ranges.map((r) => (
          <button key={r.key} type="button" onClick={() => setRange(r.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
            style={range === r.key
              ? { background: 'var(--brand)', color: '#fff' }
              : { background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">{t('c.sellingPoint')}</label>
          <MultiSelectDropdown
            options={sellingPoints.map((s) => s.name)}
            value={selSpNames}
            onChange={(names) => setMulti('sellingPointId', names.map((n) => spNameToId.get(n) || n).filter(Boolean))}
            placeholder={t('c.allSellingPoints')}
            allLabel={t('c.allSellingPoints')}
          />
        </div>
        <div>
          <label className="label">{t('sa.salesperson')}</label>
          <MultiSelectDropdown
            options={salespeople.map((u) => u.fullName)}
            value={selPersonNames}
            onChange={(names) => setMulti('soldById', names.map((n) => personNameToId.get(n) || n).filter(Boolean))}
            placeholder={t('sa.allSalespeople')}
            allLabel={t('sa.allSalespeople')}
          />
        </div>
        <div>
          <label className="label">{t('sa.paymentMethod')}</label>
          <MultiSelectDropdown
            options={['CASH', 'CARD', 'TRANSFER', 'OTHER']}
            value={selPay}
            onChange={(v) => setMulti('paymentMethod', v)}
            placeholder={t('sa.allPayments')}
            allLabel={t('sa.allPayments')}
          />
        </div>
      </div>
    </div>
  );
}
