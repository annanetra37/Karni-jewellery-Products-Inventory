'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { useT } from './I18nProvider';
import { MultiSelectDropdown } from './MultiSelectDropdown';

type IdName = { id: string; name: string };

const PRESETS = [
  { key: 'today', labelKey: 'sa.rangeToday' },
  { key: '7d', labelKey: 'sa.range7d' },
  { key: '30d', labelKey: 'sa.range30d' },
  { key: '90d', labelKey: 'sa.range90d' },
  { key: 'all', labelKey: 'sa.rangeAll' },
];

type Sel = {
  type: string[]; who: string[]; point: string[]; collection: string[]; category: string[];
  size: string[]; color: string[]; q: string; from: string; to: string; range: string;
};

/**
 * Elegant check-in filter bar (replaces the old native multi-selects). Drives
 * repeated `who/point/collection/category/size/color` params plus `q` and a date
 * window, preserving `order` and resetting pagination. Path-agnostic so it works
 * on both /receive and the receive-stock analytics page.
 */
export function CheckinFilters({
  who, points, collections, categories, sizes, colors, types,
  showSearch = false, datePresets = false, defaultRange = 'all',
}: {
  who: IdName[]; points: IdName[];
  collections: string[]; categories: string[]; sizes: string[]; colors: string[];
  /** Movement types (enum values) — when set, shows a "type" multi-select that
   *  drives the `type` param (labels come from the `sm.t<TYPE>` keys). */
  types?: string[];
  showSearch?: boolean; datePresets?: boolean; defaultRange?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const { t, tl } = useT();
  const [pending, start] = useTransition();

  const current: Sel = {
    type: params.getAll('type'),
    who: params.getAll('who'), point: params.getAll('point'),
    collection: params.getAll('collection'), category: params.getAll('category'),
    size: params.getAll('size'), color: params.getAll('color'),
    q: params.get('q') || '', from: params.get('from') || '', to: params.get('to') || '',
    range: params.get('range') || '',
  };
  const custom = !!(current.from || current.to);
  const activeRange = custom ? 'custom' : (current.range || defaultRange);
  const today = new Date().toISOString().slice(0, 10);

  const whoNameToId = new Map(who.map((w) => [w.name, w.id]));
  const whoIdToName = new Map(who.map((w) => [w.id, w.name]));
  const ptNameToId = new Map(points.map((p) => [p.name, p.id]));
  const ptIdToName = new Map(points.map((p) => [p.id, p.name]));

  const anyActive = current.type.length > 0 || current.who.length > 0 || current.point.length > 0 || current.collection.length > 0
    || current.category.length > 0 || current.size.length > 0 || current.color.length > 0
    || !!current.q || custom || (!!current.range && current.range !== defaultRange);

  function apply(next: Partial<Sel>) {
    const s = { ...current, ...next };
    const u = new URLSearchParams();
    s.type.forEach((v) => u.append('type', v));
    s.who.forEach((v) => u.append('who', v));
    s.point.forEach((v) => u.append('point', v));
    s.collection.forEach((v) => u.append('collection', v));
    s.category.forEach((v) => u.append('category', v));
    s.size.forEach((v) => u.append('size', v));
    s.color.forEach((v) => u.append('color', v));
    if (s.q) u.set('q', s.q);
    if (s.from) u.set('from', s.from);
    if (s.to) u.set('to', s.to);
    if (s.range && s.range !== defaultRange && !s.from && !s.to) u.set('range', s.range);
    const order = params.get('order');
    if (order) u.set('order', order);
    const qs = u.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  const setMulti = (k: keyof Sel, vals: string[]) => apply({ [k]: vals } as Partial<Sel>);
  const setDate = (name: 'from' | 'to', val: string) => apply({ [name]: val, range: '' } as Partial<Sel>);
  const reset = () => start(() => router.replace(pathname, { scroll: false }));

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--brand-deep)' }}>
          {t('an.filters')}
          {pending && <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" aria-hidden="true" />}
        </p>
        <button type="button" onClick={reset} disabled={!anyActive}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--brand)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 2v6h6" /><path d="M3.51 9a9 9 0 1 0 2.13-3.36L3 8" />
          </svg>
          {t('c.reset')}
        </button>
      </div>

      {/* Date window */}
      <div className="flex flex-wrap items-center gap-1.5">
        {datePresets && PRESETS.map((r) => (
          <button key={r.key} type="button" onClick={() => apply({ range: r.key, from: '', to: '' })}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
            style={activeRange === r.key
              ? { background: 'var(--brand)', color: '#fff' }
              : { background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}>
            {t(r.labelKey)}
          </button>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1"
          style={custom ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface)', border: '1px solid var(--border-strong)' }}>
          <input type="date" value={current.from} max={current.to || today} onChange={(e) => setDate('from', e.target.value)}
            className="bg-transparent text-xs outline-none" style={{ colorScheme: 'light' }} aria-label={t('r.from')} />
          <span className="text-xs opacity-60">–</span>
          <input type="date" value={current.to} max={today} min={current.from || undefined} onChange={(e) => setDate('to', e.target.value)}
            className="bg-transparent text-xs outline-none" style={{ colorScheme: 'light' }} aria-label={t('r.to')} />
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {types && types.length > 0 && (
          <div>
            <label className="label">{t('sm.type')}</label>
            <MultiSelectDropdown options={types} value={current.type} onChange={(v) => setMulti('type', v)}
              placeholder={t('sm.allTypes')} allLabel={t('sm.allTypes')} renderLabel={(v) => t('sm.t' + v)} />
          </div>
        )}
        <div>
          <label className="label">{t('r.who')}</label>
          <MultiSelectDropdown options={who.map((w) => w.name)} value={current.who.map((id) => whoIdToName.get(id) || id)}
            onChange={(names) => setMulti('who', names.map((n) => whoNameToId.get(n) || n).filter(Boolean))}
            placeholder={t('r.allPeople')} allLabel={t('r.allPeople')} />
        </div>
        <div>
          <label className="label">{t('c.sellingPoint')}</label>
          <MultiSelectDropdown options={points.map((p) => p.name)} value={current.point.map((id) => ptIdToName.get(id) || id)}
            onChange={(names) => setMulti('point', names.map((n) => ptNameToId.get(n) || n).filter(Boolean))}
            placeholder={t('c.allSellingPoints')} allLabel={t('c.allSellingPoints')} />
        </div>
        <div>
          <label className="label">{t('c.collection')}</label>
          <MultiSelectDropdown options={collections} value={current.collection} onChange={(v) => setMulti('collection', v)}
            placeholder={t('r.allCollections')} allLabel={t('r.allCollections')} renderLabel={tl} />
        </div>
        <div>
          <label className="label">{t('c.category')}</label>
          <MultiSelectDropdown options={categories} value={current.category} onChange={(v) => setMulti('category', v)}
            placeholder={t('r.allCategories')} allLabel={t('r.allCategories')} renderLabel={tl} />
        </div>
        <div>
          <label className="label">{t('c.anySize')}</label>
          <MultiSelectDropdown options={sizes} value={current.size} onChange={(v) => setMulti('size', v)}
            placeholder={t('r.allSizes')} allLabel={t('r.allSizes')} />
        </div>
        <div>
          <label className="label">{t('c.color')}</label>
          <MultiSelectDropdown options={colors} value={current.color} onChange={(v) => setMulti('color', v)}
            placeholder={t('r.allColors')} allLabel={t('r.allColors')} />
        </div>
      </div>

      {showSearch && (
        <input className="input" defaultValue={current.q} placeholder={t('c.search')}
          onKeyDown={(e) => { if (e.key === 'Enter') apply({ q: (e.target as HTMLInputElement).value.trim() }); }} />
      )}
    </div>
  );
}
