'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useT } from './I18nProvider';
import { MultiSelectDropdown } from './MultiSelectDropdown';

const ALL_SP = '';

const splitParam = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const joinValues = (vs: string[]) => vs.join(',');

export function InventoryFilters({
  categories, collections, subcollections, sizes, colors, sellingPoints,
}: {
  categories: string[];
  collections: string[];
  subcollections: string[];
  sizes: string[];
  colors: string[];
  sellingPoints: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { t, tl } = useT();
  const [pending, start] = useTransition();

  function push(next: URLSearchParams) {
    const qs = next.toString();
    start(() => router.replace(qs ? `/admin/inventory?${qs}` : '/admin/inventory', { scroll: false }));
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

  function setStock(value: string) {
    const u = new URLSearchParams(params.toString());
    if (value && value !== 'all') u.set('stock', value);
    else u.delete('stock');
    push(u);
  }

  const stock = params.get('stock') || 'all';
  const sp = params.get('sellingPointId') || '';
  const selectedCats = splitParam(params.get('category'));
  const selectedColls = splitParam(params.get('collection'));
  const selectedSubs = splitParam(params.get('subcollection'));
  const selectedSizes = splitParam(params.get('size'));
  const selectedColors = splitParam(params.get('color'));

  // Local search box with debounced URL sync.
  const urlQ = params.get('q') || '';
  const [query, setQuery] = useState(urlQ);
  useEffect(() => { setQuery(urlQ); }, [urlQ]);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === urlQ) return;
    const handle = setTimeout(() => {
      const u = new URLSearchParams(params.toString());
      if (trimmed) u.set('q', trimmed); else u.delete('q');
      push(u);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const keys = ['category', 'collection', 'subcollection', 'size', 'color', 'sellingPointId', 'q'] as const;
  const anyActive = keys.some((k) => !!params.get(k)) || stock !== 'all';

  const stockTabs: { key: string; label: string }[] = [
    { key: 'all', label: t('c.stockAll') },
    { key: 'in', label: t('inv.statusIn') },
    { key: 'low', label: t('inv.statusLow') },
    { key: 'out', label: t('inv.statusOut') },
  ];

  return (
    <div className="card space-y-4">
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

      {/* Stock status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {stockTabs.map((s) => (
          <button key={s.key} type="button" onClick={() => setStock(s.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
            style={stock === s.key
              ? { background: 'var(--brand)', color: '#fff' }
              : { background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Free-text search */}
      <div>
        <label className="label">{t('inv.search')}</label>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('c.searchPlaceholder')}
        />
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
          <select className="input" value={sp} onChange={(e) => setSingle('sellingPointId', e.target.value)}>
            <option value={ALL_SP}>{t('c.allSellingPoints')}</option>
            {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
