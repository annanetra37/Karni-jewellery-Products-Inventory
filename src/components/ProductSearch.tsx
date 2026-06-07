'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from './I18nProvider';
import { readUrlParam, syncUrlParams } from '@/lib/urlSync';

type SearchResult = {
  id: string; sku: string; designName: string; category: string | null;
  collection: string | null; subcollection: string | null; size: string | null; color: string | null;
  priceAmd: string; imageUrl: string | null; status: string; reorderPoint: number; quantity: number | null;
};

type SellingPoint = { id: string; name: string; type: string };

const LIMIT = 24;

export function ProductSearch({
  sellingPoints, defaultSellingPointId, onPick, hideStock = false, autoFocus = false, linkBase, urlSync = false,
}: {
  sellingPoints: SellingPoint[];
  defaultSellingPointId?: string;
  onPick?: (r: SearchResult) => void;
  hideStock?: boolean;
  autoFocus?: boolean;
  linkBase?: string;
  /** Mirror state into URL so a refresh restores filters / page / query. */
  urlSync?: boolean;
}) {
  const [q, setQ] = useState(urlSync ? readUrlParam('sq') : '');
  const [spId, setSpId] = useState(urlSync ? (readUrlParam('ssp') || defaultSellingPointId || '') : (defaultSellingPointId || ''));
  const [collection, setCollection] = useState(urlSync ? readUrlParam('scol') : '');
  const [category, setCategory] = useState(urlSync ? readUrlParam('scat') : '');
  const [color, setColor] = useState(urlSync ? readUrlParam('sclr') : '');
  const [size, setSize] = useState(urlSync ? readUrlParam('ssiz') : '');
  const [subcollection, setSubcollection] = useState(urlSync ? readUrlParam('ssub') : '');
  const [stock, setStock] = useState<'all' | 'in' | 'out'>(
    urlSync && (['in', 'out'] as const).includes(readUrlParam('sstk') as 'in' | 'out')
      ? (readUrlParam('sstk') as 'in' | 'out')
      : 'all'
  );
  const [page, setPage] = useState(urlSync ? (Number(readUrlParam('spg', '0')) || 0) : 0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<{ categories: string[]; sizes: string[]; subcollections: string[]; colors: string[]; collections: string[] }>({ categories: [], sizes: [], subcollections: [], colors: [], collections: [] });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useT();

  // Load distinct facet values from the catalog, scoped by every other
  // active filter ("leave one out") so each dropdown only offers values
  // that still have matching variants.
  useEffect(() => {
    const u = new URLSearchParams();
    if (collection) u.set('collection', collection);
    if (category) u.set('category', category);
    if (subcollection) u.set('subcollection', subcollection);
    if (size) u.set('size', size);
    if (color) u.set('color', color);
    fetch(`/api/facets?${u.toString()}`)
      .then((r) => r.json())
      .then((d) => setFacets({
        categories: d.categories || [],
        sizes: d.sizes || [],
        subcollections: d.subcollections || [],
        colors: d.colors || [],
        collections: d.collections || [],
      }))
      .catch(() => {});
  }, [collection, category, subcollection, size, color]);

  const filtersActive = !!(q || spId || collection || category || color || size || subcollection || stock !== 'all');

  // Reset to first page whenever a filter changes.
  useEffect(() => { setPage(0); }, [q, spId, collection, category, color, size, subcollection, stock]);

  const url = useMemo(() => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (spId) u.set('sellingPointId', spId);
    if (collection) u.set('collection', collection);
    if (category) u.set('category', category);
    if (color) u.set('color', color);
    if (size) u.set('size', size);
    if (subcollection) u.set('subcollection', subcollection);
    if (stock !== 'all') u.set('stock', stock);
    u.set('limit', String(LIMIT));
    u.set('offset', String(page * LIMIT));
    return `/api/search?${u.toString()}`;
  }, [q, spId, collection, category, color, size, subcollection, stock, page]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setLoading(true);
      fetch(url)
        .then((r) => r.json())
        .then((d) => { setResults(d.results || []); setTotal(d.total || 0); })
        .finally(() => setLoading(false));
    }, 180);
  }, [url]);

  // Mirror state into URL without triggering a Next.js server re-render.
  useEffect(() => {
    if (!urlSync) return;
    syncUrlParams({
      sq: q,
      ssp: spId === (defaultSellingPointId || '') ? '' : spId,
      scol: collection,
      scat: category,
      ssub: subcollection,
      ssiz: size,
      sclr: color,
      sstk: stock === 'all' ? '' : stock,
      spg: page === 0 ? '' : page,
    });
  }, [urlSync, q, spId, defaultSellingPointId, collection, category, subcollection, size, color, stock, page]);

  function reset() {
    setQ(''); setSpId(defaultSellingPointId || ''); setCollection(''); setCategory(''); setColor(''); setSize(''); setSubcollection(''); setStock('all'); setPage(0);
  }

  const start = total === 0 ? 0 : page * LIMIT + 1;
  const end = Math.min(total, (page + 1) * LIMIT);
  const lastPage = Math.max(0, Math.ceil(total / LIMIT) - 1);

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-karni-700 pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            autoFocus={autoFocus}
            inputMode="search"
            enterKeyHint="search"
            placeholder={t('c.searchPlaceholder')}
            className="input pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input flex-1 min-w-[150px]" value={spId} onChange={(e) => setSpId(e.target.value)}>
            <option value="">{t('c.allSellingPoints')}</option>
            {sellingPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
          <select className="input flex-1 min-w-[140px]" value={collection} onChange={(e) => setCollection(e.target.value)}>
            <option value="">— {t('c.collection').toLowerCase()} —</option>
            {facets.collections.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input flex-1 min-w-[140px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('c.allCategories')}</option>
            {facets.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input flex-1 min-w-[140px]" value={subcollection} onChange={(e) => setSubcollection(e.target.value)}>
            <option value="">{t('c.anySubcollection')}</option>
            {facets.subcollections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input flex-1 min-w-[120px]" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">{t('c.anySize')}</option>
            {facets.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input flex-1 min-w-[140px]" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">— {t('c.color').toLowerCase()} —</option>
            {facets.colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input flex-1 min-w-[140px]" value={stock} onChange={(e) => setStock(e.target.value as 'all' | 'in' | 'out')}>
            <option value="all">{t('c.stockAll')}</option>
            <option value="in">{t('c.stockIn')}</option>
            <option value="out">{t('c.stockOut')}</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-karni-700">
            {loading ? t('c.loading') : total > 0 ? `${t('c.showing')} ${start}–${end} ${t('c.of')} ${total}` : t('c.noMatches')}
          </p>
          <button type="button" onClick={reset} disabled={!filtersActive}
            className="btn-link disabled:opacity-40 disabled:cursor-not-allowed">
            {t('c.reset')}
          </button>
        </div>
      </div>

      <ul className="grid gap-2">
        {results.map((r) => {
          const qty = r.quantity ?? 0;
          const stockBadge = hideStock ? null
            : qty <= 0 ? <span className="chip chip-danger">{t('c.outOfStock')}</span>
            : qty <= r.reorderPoint ? <span className="chip chip-warn">{t('c.low')} · {qty}</span>
            : <span className="chip chip-ok">{qty} {t('c.inStock')}</span>;
          const inner = (
            <>
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-karni-100 to-karni-50 flex items-center justify-center overflow-hidden shrink-0 border border-karni-100">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt={r.designName} className="w-full h-full object-cover" />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-karni-500" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{r.designName}</p>
                <p className="text-xs text-karni-700 truncate">
                  {[r.subcollection, r.color, r.size].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[10px] text-karni-700 mt-1 font-mono truncate opacity-70">{r.sku}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold whitespace-nowrap">{Math.round(Number(r.priceAmd)).toLocaleString()} ֏</p>
                <div className="mt-1">{stockBadge}</div>
              </div>
            </>
          );
          return (
            <li key={r.id}>
              {linkBase ? (
                <a href={`${linkBase}/${r.id}`} className="card-interactive w-full text-left flex items-center gap-3 no-underline">{inner}</a>
              ) : (
                <button type="button" onClick={() => onPick?.(r)} className="card-interactive w-full text-left flex items-center gap-3">{inner}</button>
              )}
            </li>
          );
        })}
        {!loading && results.length === 0 && (
          <li className="text-center text-karni-700 text-sm py-10">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-50" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            {t('c.noResults')}
          </li>
        )}
      </ul>

      {total > LIMIT && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" className="btn-secondary" disabled={page <= 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            ← {t('c.prev')}
          </button>
          <span className="text-sm text-karni-700">{t('c.page')} {page + 1} {t('c.of')} {lastPage + 1}</span>
          <button type="button" className="btn-secondary" disabled={page >= lastPage || loading} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>
            {t('c.next')} →
          </button>
        </div>
      )}
    </div>
  );
}
