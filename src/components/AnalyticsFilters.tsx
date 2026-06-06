'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useT } from './I18nProvider';

export function AnalyticsFilters({
  categories, collections, subcollections, sizes, sellingPoints,
}: {
  categories: string[];
  collections: string[];
  subcollections: string[];
  sizes: string[];
  sellingPoints: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useT();
  const [pending, start] = useTransition();

  // Color is a text input — debounce so each keystroke doesn't navigate.
  const [color, setColor] = useState(params.get('color') || '');
  const colorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local color state in sync if user clicks Clear or navigates back.
  useEffect(() => {
    const fromUrl = params.get('color') || '';
    if (fromUrl !== color) setColor(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function push(next: URLSearchParams) {
    const qs = next.toString();
    start(() => router.replace(qs ? `/admin/analytics?${qs}` : '/admin/analytics', { scroll: false }));
  }

  function setParam(name: string, value: string) {
    const u = new URLSearchParams(params.toString());
    if (value) u.set(name, value);
    else u.delete(name);
    push(u);
  }

  function updateColor(v: string) {
    setColor(v);
    if (colorDebounce.current) clearTimeout(colorDebounce.current);
    colorDebounce.current = setTimeout(() => setParam('color', v.trim()), 300);
  }

  const keys = ['category', 'collection', 'subcollection', 'size', 'color', 'sellingPointId'] as const;
  const anyActive = keys.some((k) => !!params.get(k));

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--brand-deep)' }}>
          {t('an.filters')}
          {pending && (
            <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" aria-hidden="true" />
          )}
        </p>
        {anyActive && (
          <button type="button" onClick={() => push(new URLSearchParams())} className="btn-link">
            {t('an.clearFilters')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">{t('c.category')}</label>
          <select className="input" value={params.get('category') || ''} onChange={(e) => setParam('category', e.target.value)}>
            <option value="">{t('c.allCategories')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('c.collection')}</label>
          <select className="input" value={params.get('collection') || ''} onChange={(e) => setParam('collection', e.target.value)}>
            <option value="">—</option>
            {collections.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('c.subcollection')}</label>
          <select className="input" value={params.get('subcollection') || ''} onChange={(e) => setParam('subcollection', e.target.value)}>
            <option value="">{t('c.anySubcollection')}</option>
            {subcollections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('c.size')}</label>
          <select className="input" value={params.get('size') || ''} onChange={(e) => setParam('size', e.target.value)}>
            <option value="">{t('c.anySize')}</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('c.color')}</label>
          <input className="input" value={color} onChange={(e) => updateColor(e.target.value)} placeholder={t('c.color')} />
        </div>
        <div>
          <label className="label">{t('c.sellingPoint')}</label>
          <select className="input" value={params.get('sellingPointId') || ''} onChange={(e) => setParam('sellingPointId', e.target.value)}>
            <option value="">{t('c.allSellingPoints')}</option>
            {sellingPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
