'use client';

import { useEffect, useState } from 'react';
import { useT } from './I18nProvider';
import { readUrlParam, syncUrlParams } from '@/lib/urlSync';

export type BrowseVariant = {
  id: string; sku: string; designName: string;
  category: string | null; collection: string | null; subcollection: string | null;
  size: string | null; color: string | null;
  priceAmd: string; imageUrl: string | null; status: string; reorderPoint: number; quantity: number | null;
};

type Tile = { name: string; count: number; imageUrl: string | null };
const SIZE_ORDER: Record<string, number> = { small: 1, medium: 2, large: 3 };

export function ProductBrowse({
  sellingPointId,
  onPick,
  hideStock = false,
  urlSync = false,
}: {
  sellingPointId?: string;
  onPick?: (v: BrowseVariant) => void;
  hideStock?: boolean;
  /** When true, drill-down + filter state is mirrored into the URL so a
   *  page refresh restores the user to the same place. */
  urlSync?: boolean;
}) {
  // Initial state — when urlSync is on, hydrate from URL so refresh restores.
  const initCol = urlSync ? readUrlParam('bcol') : '';
  const initCat = urlSync ? readUrlParam('bcat') : '';
  const [collection, setCollection] = useState(initCol);
  const [category, setCategory] = useState(initCat);
  // Derive the displayed step from coll/cat presence.
  const [step, setStep] = useState<'col' | 'cat' | 'var'>(initCat ? 'var' : initCol ? 'cat' : 'col');

  const [collections, setCollections] = useState<Tile[]>([]);
  const [categories, setCategories] = useState<Tile[]>([]);
  const [variants, setVariants] = useState<BrowseVariant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(urlSync ? (Number(readUrlParam('bpg', '0')) || 0) : 0);
  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState<'all' | 'in' | 'out'>(
    urlSync && (['in', 'out'] as const).includes(readUrlParam('bstk') as 'in' | 'out')
      ? (readUrlParam('bstk') as 'in' | 'out')
      : 'all'
  );
  const [size, setSize] = useState(urlSync ? readUrlParam('bsiz') : '');
  const [color, setColor] = useState(urlSync ? readUrlParam('bclr') : '');
  const [subcollection, setSubcollection] = useState(urlSync ? readUrlParam('bsub') : '');
  const [facets, setFacets] = useState<{ sizes: string[]; subcollections: string[]; colors: string[] }>({ sizes: [], subcollections: [], colors: [] });
  // Bumped on Refresh — every fetch in this component watches it so a click
  // re-pulls collections / categories / variants without a full page reload.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const { t } = useT();

  const VAR_LIMIT = 24;

  useEffect(() => {
    setLoading(true);
    fetch('/api/browse/collections')
      .then((r) => r.json())
      .then((d) => setCollections(d.items || []))
      .finally(() => setLoading(false));
  }, [refreshNonce]);

  useEffect(() => {
    if (step !== 'cat') return;
    setLoading(true);
    fetch(`/api/browse/categories?collection=${encodeURIComponent(collection)}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.items || []))
      .finally(() => setLoading(false));
  }, [step, collection, refreshNonce]);

  // Load subcollections / sizes / colors scoped by every currently selected
  // filter ("leave one out"): change any filter and the other dropdowns
  // narrow to values that still have matching variants.
  useEffect(() => {
    if (step !== 'var') return;
    const u = new URLSearchParams();
    if (collection) u.set('collection', collection);
    if (category) u.set('category', category);
    if (subcollection) u.set('subcollection', subcollection);
    if (size) u.set('size', size);
    if (color) u.set('color', color);
    fetch(`/api/facets?${u.toString()}`)
      .then((r) => r.json())
      .then((d) => setFacets({ sizes: d.sizes || [], subcollections: d.subcollections || [], colors: d.colors || [] }))
      .catch(() => {});
  }, [step, collection, category, subcollection, size, color, refreshNonce]);

  // Reset to first page when any filter changes.
  useEffect(() => { setPage(0); }, [collection, category, stock, size, color, subcollection]);

  // Clear subcollection when leaving the variant step.
  useEffect(() => { if (step !== 'var') setSubcollection(''); }, [step]);

  useEffect(() => {
    if (step !== 'var') return;
    setLoading(true);
    const u = new URLSearchParams();
    u.set('collection', collection);
    u.set('category', category);
    if (sellingPointId) u.set('sellingPointId', sellingPointId);
    if (stock !== 'all') u.set('stock', stock);
    if (size) u.set('size', size);
    if (color) u.set('color', color);
    if (subcollection) u.set('subcollection', subcollection);
    u.set('limit', String(VAR_LIMIT));
    u.set('offset', String(page * VAR_LIMIT));
    fetch(`/api/search?${u.toString()}`)
      .then((r) => r.json())
      .then((d) => { setVariants(d.results || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [step, collection, category, sellingPointId, stock, size, color, subcollection, page, refreshNonce]);

  function resetFilters() { setStock('all'); setSize(''); setColor(''); setSubcollection(''); setPage(0); }
  function refresh() { setRefreshNonce((n) => n + 1); }

  // Mirror state into URL (history.replaceState — no server re-render).
  useEffect(() => {
    if (!urlSync) return;
    syncUrlParams({
      bcol: collection,
      bcat: category,
      bsub: subcollection,
      bsiz: size,
      bclr: color,
      bstk: stock === 'all' ? '' : stock,
      bpg: page === 0 ? '' : page,
    });
  }, [urlSync, collection, category, subcollection, size, color, stock, page]);

  function pickCollection(name: string) { setCollection(name); setCategory(''); setStep('cat'); }
  function pickCategory(name: string) { setCategory(name); setStep('var'); }
  function back() {
    if (step === 'var') setStep('cat');
    else if (step === 'cat') { setCollection(''); setStep('col'); }
  }

  const crumbs = (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        {step !== 'col' && (
          <button type="button" onClick={back} className="btn-link inline-flex items-center gap-1 shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            {t('c.back')}
          </button>
        )}
        <span className="text-karni-700 truncate">
          {step === 'col' && t('b.pickCollection')}
          {step === 'cat' && <>{collection} <span className="text-karni-400">·</span> {t('b.pickCategory')}</>}
          {step === 'var' && <>{collection} <span className="text-karni-400">·</span> {category}</>}
        </span>
      </div>
      {step !== 'var' && (
        <button type="button" onClick={refresh} disabled={loading}
          className="btn-link inline-flex items-center gap-1.5 text-xs disabled:opacity-50 shrink-0"
          aria-label={t('c.refresh')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" className={loading ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 1 1-3.07-6.79" />
            <path d="M21 3v6h-6" />
          </svg>
          {t('c.refresh')}
        </button>
      )}
    </div>
  );

  if (step === 'col') {
    return (
      <div className="space-y-3">
        {crumbs}
        {loading && <p className="text-xs text-karni-700 text-center">Loading…</p>}
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {collections.map((c) => (
            <li key={c.name}>
              <button type="button" onClick={() => pickCollection(c.name)}
                className="group block w-full text-left rounded-2xl overflow-hidden bg-white border border-karni-100 shadow-soft hover:shadow-lift transition-all hover:-translate-y-0.5">
                <PhotoBox src={c.imageUrl} alt={c.name} />
                <div className="p-3">
                  <p className="font-semibold text-karni-900">{c.name}</p>
                  <p className="text-xs text-karni-700">{c.count} {t('c.items')}</p>
                </div>
              </button>
            </li>
          ))}
          {!loading && collections.length === 0 && (
            <li className="col-span-full text-center text-karni-700 text-sm py-8">{t('b.noCollections')}</li>
          )}
        </ul>
      </div>
    );
  }

  if (step === 'cat') {
    return (
      <div className="space-y-3">
        {crumbs}
        {loading && <p className="text-xs text-karni-700 text-center">Loading…</p>}
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((c) => (
            <li key={c.name}>
              <button type="button" onClick={() => pickCategory(c.name)}
                className="group block w-full text-left rounded-2xl overflow-hidden bg-white border border-karni-100 shadow-soft hover:shadow-lift transition-all hover:-translate-y-0.5">
                <PhotoBox src={c.imageUrl} alt={c.name} />
                <div className="p-3">
                  <p className="font-semibold text-karni-900">{c.name}</p>
                  <p className="text-xs text-karni-700">{c.count} {t('c.items')}</p>
                </div>
              </button>
            </li>
          ))}
          {!loading && categories.length === 0 && (
            <li className="col-span-full text-center text-karni-700 text-sm py-8">{t('b.noCategories')}</li>
          )}
        </ul>
      </div>
    );
  }

  // step === 'var'
  const buckets = new Map<string, BrowseVariant[]>();
  for (const v of variants) {
    const k = (v.size || '').trim();
    const arr = buckets.get(k) || [];
    arr.push(v);
    buckets.set(k, arr);
  }
  const sizeKeys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return (SIZE_ORDER[a.toLowerCase()] || 99) - (SIZE_ORDER[b.toLowerCase()] || 99);
  });
  const hasSizes = sizeKeys.filter((k) => k !== '').length > 1;

  const start = total === 0 ? 0 : page * VAR_LIMIT + 1;
  const end = Math.min(total, (page + 1) * VAR_LIMIT);
  const lastPage = Math.max(0, Math.ceil(total / VAR_LIMIT) - 1);
  const filtersActive = stock !== 'all' || !!size || !!color || !!subcollection;

  return (
    <div className="space-y-4">
      {crumbs}

      <div className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {facets.subcollections.length > 0 && (
            <select className="input flex-1 min-w-[140px]" value={subcollection} onChange={(e) => setSubcollection(e.target.value)}>
              <option value="">{t('c.anySubcollection')}</option>
              {facets.subcollections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
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
          <div className="flex items-center gap-3">
            <button type="button" onClick={refresh} disabled={loading}
              className="btn-link inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
              aria-label={t('c.refresh')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true" className={loading ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-3.07-6.79" />
                <path d="M21 3v6h-6" />
              </svg>
              {t('c.refresh')}
            </button>
            <button type="button" onClick={resetFilters} disabled={!filtersActive}
              className="btn-link disabled:opacity-40 disabled:cursor-not-allowed">
              {t('c.reset')}
            </button>
          </div>
        </div>
      </div>

      {sizeKeys.map((k) => {
        const list = buckets.get(k)!;
        const label = k ? k.charAt(0).toUpperCase() + k.slice(1) : (hasSizes ? t('b.oneSize') : '');
        return (
          <section key={k || 'none'} className="space-y-2">
            {hasSizes && <h3 className="text-xs font-semibold uppercase tracking-wide text-karni-700">{label}</h3>}
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {list.map((v) => {
                const qty = v.quantity ?? 0;
                const chip = hideStock ? null
                  : qty <= 0 ? <span className="chip chip-danger">{t('c.outOfStock')}</span>
                  : qty <= v.reorderPoint ? <span className="chip chip-warn">{t('c.low')} · {qty}</span>
                  : <span className="chip chip-ok">{qty}</span>;
                return (
                  <li key={v.id}>
                    <button type="button" onClick={() => onPick?.(v)}
                      className="block w-full text-left rounded-2xl overflow-hidden bg-white border border-karni-100 shadow-soft hover:shadow-lift transition-all hover:-translate-y-0.5">
                      <PhotoBox src={v.imageUrl} alt={v.designName} square />
                      <div className="p-3 space-y-1">
                        <p className="font-semibold text-karni-900 truncate">{v.designName}</p>
                        <p className="text-xs text-karni-700 truncate">{[v.subcollection, v.color].filter(Boolean).join(' · ')}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="font-bold text-sm">{Math.round(Number(v.priceAmd)).toLocaleString()} ֏</p>
                          {chip}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!loading && variants.length === 0 && (
        <p className="text-center text-karni-700 text-sm py-6">{t('c.noResults')}</p>
      )}

      {total > VAR_LIMIT && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" className="btn-secondary" disabled={page <= 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>
            ← {t('c.prev')}
          </button>
          <span className="text-sm text-karni-700">{t('c.page')} {page + 1} {t('c.of')} {lastPage + 1}</span>
          <button type="button" className="btn-secondary" disabled={page >= lastPage || loading}
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>
            {t('c.next')} →
          </button>
        </div>
      )}
    </div>
  );
}

function PhotoBox({ src, alt, square = false }: { src: string | null; alt: string; square?: boolean }) {
  const aspect = square ? 'aspect-square' : 'aspect-[4/3]';
  return (
    <div className={`${aspect} bg-gradient-to-br from-karni-100 to-karni-50 overflow-hidden`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-karni-400">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      )}
    </div>
  );
}
