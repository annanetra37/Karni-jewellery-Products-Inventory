'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './I18nProvider';
import { MultiSelectDropdown } from './MultiSelectDropdown';

/**
 * Filter the production worklist by stock state, category, collection and
 * selling point. Drives repeated `state/cat/col/pt` params while preserving the
 * date range (range/from/to). Multi-select throughout.
 */
export function ProductionFilters({ categories, collections, points }: {
  categories: string[]; collections: string[]; points: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const { t, tl } = useT();
  const [pending, start] = useTransition();

  const cur = {
    state: params.getAll('state'), cat: params.getAll('cat'),
    col: params.getAll('col'), pt: params.getAll('pt'),
  };
  const anyActive = cur.state.length + cur.cat.length + cur.col.length + cur.pt.length > 0;
  const stateLabel = (v: string) => (v === 'OUT' ? t('sm.outOfStock') : t('pr.low'));

  function apply(next: Partial<typeof cur>) {
    const s = { ...cur, ...next };
    const u = new URLSearchParams();
    // Preserve the date range controls.
    for (const k of ['range', 'from', 'to']) { const v = params.get(k); if (v) u.set(k, v); }
    s.state.forEach((v) => u.append('state', v));
    s.cat.forEach((v) => u.append('cat', v));
    s.col.forEach((v) => u.append('col', v));
    s.pt.forEach((v) => u.append('pt', v));
    const qs = u.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  const reset = () => {
    const u = new URLSearchParams();
    for (const k of ['range', 'from', 'to']) { const v = params.get(k); if (v) u.set(k, v); }
    const qs = u.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--brand-deep)' }}>
          {t('an.filters')}
          {pending && <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" aria-hidden="true" />}
        </p>
        <button type="button" onClick={reset} disabled={!anyActive}
          className="text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-40"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--brand)' }}>
          {t('c.reset')}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="label">{t('pr.state')}</label>
          <MultiSelectDropdown options={['OUT', 'LOW']} value={cur.state} onChange={(v) => apply({ state: v })}
            placeholder={t('pr.allStates')} allLabel={t('pr.allStates')} renderLabel={stateLabel} />
        </div>
        <div>
          <label className="label">{t('c.category')}</label>
          <MultiSelectDropdown options={categories} value={cur.cat} onChange={(v) => apply({ cat: v })}
            placeholder={t('r.allCategories')} allLabel={t('r.allCategories')} renderLabel={tl} />
        </div>
        <div>
          <label className="label">{t('c.collection')}</label>
          <MultiSelectDropdown options={collections} value={cur.col} onChange={(v) => apply({ col: v })}
            placeholder={t('r.allCollections')} allLabel={t('r.allCollections')} renderLabel={tl} />
        </div>
        <div>
          <label className="label">{t('c.sellingPoint')}</label>
          <MultiSelectDropdown options={points} value={cur.pt} onChange={(v) => apply({ pt: v })}
            placeholder={t('c.allSellingPoints')} allLabel={t('c.allSellingPoints')} />
        </div>
      </div>
    </div>
  );
}
