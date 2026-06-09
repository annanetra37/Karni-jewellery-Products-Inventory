'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './I18nProvider';
import { MultiSelectDropdown } from './MultiSelectDropdown';

const ALL_SP = '_all';

const splitParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const joinValues = (vs: string[]) => vs.join(',');

export function AnalyticsFilters({
  categories, collections, subcollections, sizes, colors, sellingPoints, defaultSellingPointId,
}: {
  categories: string[];
  collections: string[];
  subcollections: string[];
  sizes: string[];
  colors: string[];
  sellingPoints: { id: string; name: string }[];
  /** Falls back to this when no sellingPointId is in the URL (e.g. Megamall). */
  defaultSellingPointId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { t, tl } = useT();
  const [pending, start] = useTransition();

  function push(next: URLSearchParams) {
    const qs = next.toString();
    start(() => router.replace(qs ? `/admin/analytics?${qs}` : '/admin/analytics', { scroll: false }));
  }

  function setMulti(name: string, values: string[]) {
    const u = new URLSearchParams(params.toString());
    if (values.length > 0) u.set(name, joinValues(values));
    else u.delete(name);
    push(u);
  }

  function setSingle(name: string, value: string) {
    const u = new URLSearchParams(params.toString());
    if (value) u.set(name, value);
    else u.delete(name);
    push(u);
  }

  const urlSp = params.get('sellingPointId') || '';
  const spValue = urlSp === ALL_SP ? ALL_SP : (urlSp || defaultSellingPointId);

  const selectedCats = splitParam(params.get('category'));
  const selectedColls = splitParam(params.get('collection'));
  const selectedSubs = splitParam(params.get('subcollection'));
  const selectedSizes = splitParam(params.get('size'));
  const selectedColors = splitParam(params.get('color'));

  const keys = ['category', 'collection', 'subcollection', 'size', 'color'] as const;
  const anyActive = keys.some((k) => !!params.get(k)) || (urlSp && urlSp !== defaultSellingPointId);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--brand-deep)' }}>
          {t('an.filters')}
          {pending && (
            <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" aria-hidden="true" />
          )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="label">{t('c.category')}</label>
          <MultiSelectDropdown
            options={categories}
            value={selectedCats}
            onChange={(v) => setMulti('category', v)}
            placeholder={t('c.allCategories')}
            allLabel={t('c.allCategories')}
            renderLabel={tl}
          />
        </div>
        <div>
          <label className="label">{t('c.collection')}</label>
          <MultiSelectDropdown
            options={collections}
            value={selectedColls}
            onChange={(v) => setMulti('collection', v)}
            placeholder="—"
            allLabel="—"
            renderLabel={tl}
          />
        </div>
        <div>
          <label className="label">{t('c.subcollection')}</label>
          <MultiSelectDropdown
            options={subcollections}
            value={selectedSubs}
            onChange={(v) => setMulti('subcollection', v)}
            placeholder={t('c.anySubcollection')}
            allLabel={t('c.anySubcollection')}
            renderLabel={tl}
          />
        </div>
        <div>
          <label className="label">{t('c.size')}</label>
          <MultiSelectDropdown
            options={sizes}
            value={selectedSizes}
            onChange={(v) => setMulti('size', v)}
            placeholder={t('c.anySize')}
            allLabel={t('c.anySize')}
          />
        </div>
        <div>
          <label className="label">{t('c.color')}</label>
          <MultiSelectDropdown
            options={colors}
            value={selectedColors}
            onChange={(v) => setMulti('color', v)}
            placeholder={`— ${t('c.color').toLowerCase()} —`}
            allLabel={`— ${t('c.color').toLowerCase()} —`}
          />
        </div>
        <div>
          <label className="label">{t('c.sellingPoint')}</label>
          <select className="input" value={spValue} onChange={(e) => setSingle('sellingPointId', e.target.value)}>
            <option value={ALL_SP}>{t('c.allSellingPoints')}</option>
            {sellingPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
