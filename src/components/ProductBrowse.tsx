'use client';

import { useEffect, useState } from 'react';
import { useT } from './I18nProvider';

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
}: {
  sellingPointId?: string;
  onPick?: (v: BrowseVariant) => void;
  hideStock?: boolean;
}) {
  const [step, setStep] = useState<'col' | 'cat' | 'var'>('col');
  const [collection, setCollection] = useState('');
  const [category, setCategory] = useState('');

  const [collections, setCollections] = useState<Tile[]>([]);
  const [categories, setCategories] = useState<Tile[]>([]);
  const [variants, setVariants] = useState<BrowseVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  useEffect(() => {
    setLoading(true);
    fetch('/api/browse/collections')
      .then((r) => r.json())
      .then((d) => setCollections(d.items || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (step !== 'cat') return;
    setLoading(true);
    fetch(`/api/browse/categories?collection=${encodeURIComponent(collection)}`)
      .then((r) => r.json())
      .then((d) => setCategories(d.items || []))
      .finally(() => setLoading(false));
  }, [step, collection]);

  useEffect(() => {
    if (step !== 'var') return;
    setLoading(true);
    const u = new URLSearchParams();
    u.set('collection', collection);
    u.set('category', category);
    if (sellingPointId) u.set('sellingPointId', sellingPointId);
    u.set('limit', '50');
    fetch(`/api/search?${u.toString()}`)
      .then((r) => r.json())
      .then((d) => setVariants(d.results || []))
      .finally(() => setLoading(false));
  }, [step, collection, category, sellingPointId]);

  function pickCollection(name: string) { setCollection(name); setCategory(''); setStep('cat'); }
  function pickCategory(name: string) { setCategory(name); setStep('var'); }
  function back() {
    if (step === 'var') setStep('cat');
    else if (step === 'cat') { setCollection(''); setStep('col'); }
  }

  const crumbs = (
    <div className="flex items-center gap-2 text-sm">
      {step !== 'col' && (
        <button type="button" onClick={back} className="btn-link inline-flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          {t('c.back')}
        </button>
      )}
      <span className="text-karni-700">
        {step === 'col' && t('b.pickCollection')}
        {step === 'cat' && <>{collection} <span className="text-karni-400">·</span> {t('b.pickCategory')}</>}
        {step === 'var' && <>{collection} <span className="text-karni-400">·</span> {category}</>}
      </span>
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

  return (
    <div className="space-y-4">
      {crumbs}
      {loading && <p className="text-xs text-karni-700 text-center">Loading…</p>}
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
        <p className="text-center text-karni-700 text-sm py-6">No items.</p>
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
