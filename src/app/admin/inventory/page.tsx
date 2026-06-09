import { requireAdmin, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { MetricCard, BarChart, DonutChart } from '@/components/Charts';
import { InventoryFilters } from '@/components/InventoryFilters';
import { Thumb } from '@/components/Thumb';
import Link from 'next/link';

type Params = Promise<{
  stock?: string;          // all | in | low | out
  category?: string;       // comma list
  collection?: string;
  subcollection?: string;
  size?: string;
  color?: string;
  sellingPointId?: string; // single
  q?: string;
}>;

const LIST_CAP = 240;

function bucket(map: Map<string, { units: number; value: number }>, key: string | null | undefined, units: number, value: number) {
  const k = key ?? '—';
  const cur = map.get(k) || { units: 0, value: 0 };
  cur.units += units;
  cur.value += value;
  map.set(k, cur);
}

export default async function AdminInventoryPage({ searchParams }: { searchParams: Params }) {
  const me = await requireAdmin();
  const scope = await sellingPointScope(me);
  const { t } = await getT();
  const sp = await searchParams;
  const split = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const stock = (sp.stock || 'all').trim();
  const categories = split(sp.category);
  const collections = split(sp.collection);
  const subcollections = split(sp.subcollection);
  const sizes = split(sp.size);
  const colors = split(sp.color);
  const rawSpId = (sp.sellingPointId || '').trim();
  // A point-scoped admin may only narrow within their assigned selling points.
  const sellingPointId = scope === null ? rawSpId : (rawSpId && scope.includes(rawSpId) ? rawSpId : '');
  // Inventory rows are always confined to the allowed scope.
  const invItemWhere = sellingPointId
    ? { sellingPointId }
    : (scope === null ? null : { sellingPointId: { in: scope } });
  const q = (sp.q || '').trim();

  // Pull every non-archived variant matching the attribute filters, with its
  // inventory rows (scoped to the chosen selling point when set). This lets us
  // surface BOTH in-stock and out-of-stock variants — out-of-stock variants
  // simply carry zero (or no) inventory rows.
  const variants = await prisma.variant.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      ...(categories.length ? { category: { in: categories } } : {}),
      ...(collections.length ? { collection: { in: collections } } : {}),
      ...(subcollections.length ? { subcollection: { in: subcollections } } : {}),
      ...(sizes.length ? { size: { in: sizes } } : {}),
      ...(colors.length ? { color: { in: colors } } : {}),
      ...(q ? { searchBlob: { contains: q.toLowerCase() } } : {}),
    },
    select: {
      id: true, sku: true, designName: true, category: true, collection: true, subcollection: true,
      size: true, color: true, priceAmd: true, costAmd: true, reorderPoint: true, imageUrl: true,
      barcode: true, status: true, weightG: true,
      inventoryItems: {
        ...(invItemWhere ? { where: invItemWhere } : {}),
        select: { quantity: true, sellingPoint: { select: { id: true, name: true } } },
      },
    },
  });

  type Computed = {
    variant: typeof variants[number];
    qty: number;
    value: number;
    status: 'in' | 'low' | 'out';
  };

  const computed: Computed[] = variants.map((v) => {
    const qty = v.inventoryItems.reduce((s, it) => s + it.quantity, 0);
    const value = Number(v.priceAmd) * qty;
    const status: Computed['status'] = qty <= 0 ? 'out' : qty <= v.reorderPoint ? 'low' : 'in';
    return { variant: v, qty, value, status };
  });

  // Status split across the full attribute-filtered set (ignores the stock tab,
  // so the breakdown card always shows the whole picture). "In stock" means
  // qty > 0 — exactly like the analytics page — and low-stock is a SUBSET of
  // in-stock (so inCount + outCount = total variants).
  let inCount = 0, lowCount = 0, outCount = 0;
  for (const c of computed) {
    if (c.qty <= 0) { outCount++; continue; }
    inCount++;
    if (c.status === 'low') lowCount++;
  }

  // The stock tab scopes everything below. "In stock" = qty > 0 (includes low).
  const visible = computed.filter((c) =>
    stock === 'in' ? c.qty > 0
    : stock === 'low' ? c.status === 'low'
    : stock === 'out' ? c.qty <= 0
    : true);

  let totalUnits = 0;
  let totalValue = 0;
  const byCategory = new Map<string, { units: number; value: number }>();
  const byCollection = new Map<string, { units: number; value: number }>();
  const bySize = new Map<string, { units: number; value: number }>();
  const byColor = new Map<string, { units: number; value: number }>();
  const bySp = new Map<string, { units: number; value: number }>();

  for (const c of visible) {
    totalUnits += c.qty;
    totalValue += c.value;
    bucket(byCategory, c.variant.category, c.qty, c.value);
    bucket(byCollection, c.variant.collection, c.qty, c.value);
    bucket(bySize, c.variant.size, c.qty, c.value);
    bucket(byColor, c.variant.color, c.qty, c.value);
    for (const it of c.variant.inventoryItems) {
      const price = Number(c.variant.priceAmd);
      bucket(bySp, it.sellingPoint.name, it.quantity, price * it.quantity);
    }
  }

  const avgUnitPrice = totalUnits > 0 ? totalValue / totalUnits : 0;

  const sortByUnits = (m: Map<string, { units: number; value: number }>) =>
    Array.from(m.entries()).map(([label, v]) => ({ label, value: v.units, sub: formatAmd(v.value) })).sort((a, b) => b.value - a.value);
  const sortByValue = (m: Map<string, { units: number; value: number }>) =>
    Array.from(m.entries()).map(([label, v]) => ({ label, value: Math.round(v.value), sub: `${v.units} u.` })).sort((a, b) => b.value - a.value);

  const catData = sortByUnits(byCategory);
  const collData = sortByValue(byCollection);
  const sizeData = sortByUnits(bySize).slice(0, 12);
  const colorData = sortByUnits(byColor).slice(0, 10);
  const spData = sortByUnits(bySp);

  // Group the (tab-scoped) items so out-of-stock and low-stock each get their
  // own detailed, drill-down section. These groups partition `visible`, so the
  // stock tab automatically controls which of them appear.
  const outItems = visible.filter((c) => c.qty <= 0).sort((a, b) => b.value - a.value);
  const lowItems = visible.filter((c) => c.status === 'low').sort((a, b) => (a.qty - b.qty) || (b.value - a.value));
  const healthyItems = visible.filter((c) => c.status === 'in').sort((a, b) => b.value - a.value);

  const statusRows = [
    { key: 'in', label: t('inv.statusIn'), count: inCount, color: 'var(--success)' },
    { key: 'low', label: t('inv.statusLow'), count: lowCount, color: 'var(--warn)' },
    { key: 'out', label: t('inv.statusOut'), count: outCount, color: 'var(--danger)' },
  ];
  const statusMax = Math.max(inCount, lowCount, outCount, 1);

  // Facets for the dropdowns — "leave one out" scoped so each dropdown only
  // offers values still present under the other active filters.
  const baseStatus = { status: { not: 'ARCHIVED' as const } };
  const facetWhere = (excluded: 'category' | 'collection' | 'subcollection' | 'size' | 'color') => ({
    ...baseStatus,
    ...(excluded !== 'category' && categories.length ? { category: { in: categories } } : {}),
    ...(excluded !== 'collection' && collections.length ? { collection: { in: collections } } : {}),
    ...(excluded !== 'subcollection' && subcollections.length ? { subcollection: { in: subcollections } } : {}),
    ...(excluded !== 'size' && sizes.length ? { size: { in: sizes } } : {}),
    ...(excluded !== 'color' && colors.length ? { color: { in: colors } } : {}),
  });
  const [catsRaw, collsRaw, subsRaw, sizesRaw, colorsRaw, sellingPointsAll] = await Promise.all([
    prisma.variant.findMany({ where: { ...facetWhere('category'), category: { not: null } }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
    prisma.variant.findMany({ where: { ...facetWhere('collection'), collection: { not: null } }, distinct: ['collection'], select: { collection: true }, orderBy: { collection: 'asc' } }),
    prisma.variant.findMany({ where: { ...facetWhere('subcollection'), subcollection: { not: null } }, distinct: ['subcollection'], select: { subcollection: true }, orderBy: { subcollection: 'asc' } }),
    prisma.variant.findMany({ where: { ...facetWhere('size'), size: { not: null } }, distinct: ['size'], select: { size: true }, orderBy: { size: 'asc' } }),
    prisma.variant.findMany({ where: { ...facetWhere('color'), color: { not: null } }, distinct: ['color'], select: { color: true }, orderBy: { color: 'asc' } }),
    prisma.sellingPoint.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const allCategories = catsRaw.map((v) => v.category!).filter(Boolean);
  const allCollections = collsRaw.map((v) => v.collection!).filter(Boolean);
  const allSubcollections = subsRaw.map((v) => v.subcollection!).filter(Boolean);
  const allSizes = sizesRaw.map((v) => v.size!).filter(Boolean);
  const allColors = colorsRaw.map((v) => v.color!).filter(Boolean);
  const sellingPoints = scope === null ? sellingPointsAll : sellingPointsAll.filter((s) => scope.includes(s.id));

  const recentMovements = await prisma.stockMovement.findMany({
    where: sellingPointId ? { sellingPointId } : (scope === null ? {} : { sellingPointId: { in: scope } }),
    orderBy: { createdAt: 'desc' }, take: 20,
    include: { variant: true, sellingPoint: true, performedBy: true },
  });

  // Active filter chips for the hero.
  const joinShort = (vs: string[]) => vs.length <= 2 ? vs.join(', ') : `${vs[0]} +${vs.length - 1}`;
  const sellingPointName = sellingPointId ? sellingPoints.find((s) => s.id === sellingPointId)?.name : '';
  const activeChips: { label: string; value: string }[] = [
    stock !== 'all' && { label: t('c.stock'), value: stock === 'in' ? t('inv.statusIn') : stock === 'low' ? t('inv.statusLow') : t('inv.statusOut') },
    q && { label: t('inv.search'), value: q },
    categories.length > 0 && { label: t('c.category'), value: joinShort(categories) },
    collections.length > 0 && { label: t('c.collection'), value: joinShort(collections) },
    subcollections.length > 0 && { label: t('c.subcollection'), value: joinShort(subcollections) },
    sizes.length > 0 && { label: t('c.size'), value: joinShort(sizes) },
    colors.length > 0 && { label: t('c.color'), value: joinShort(colors) },
    sellingPointName && { label: t('c.sellingPoint'), value: sellingPointName },
  ].filter(Boolean) as { label: string; value: string }[];

  const chipClass = (status: Computed['status']) =>
    status === 'out' ? 'chip chip-danger' : status === 'low' ? 'chip chip-warn' : 'chip chip-ok';

  // Every field we surface when a row is expanded — so low / out-of-stock
  // items (and any other) can be inspected in full without leaving the page.
  const fieldsFor = (c: Computed) => {
    const v = c.variant;
    const byPoint = v.inventoryItems.length
      ? v.inventoryItems.map((it) => `${it.sellingPoint.name}: ${it.quantity}`).join(' · ')
      : '—';
    return [
      { label: t('c.category'), value: v.category },
      { label: t('c.collection'), value: v.collection },
      { label: t('c.subcollection'), value: v.subcollection },
      { label: t('c.size'), value: v.size },
      { label: t('c.color'), value: v.color },
      { label: t('c.price'), value: formatAmd(Number(v.priceAmd)) },
      { label: t('c.cost'), value: v.costAmd != null ? formatAmd(Number(v.costAmd)) : null },
      { label: t('inv.reorderPoint'), value: String(v.reorderPoint) },
      { label: t('inv.onHand'), value: String(c.qty) },
      { label: t('inv.byPoint'), value: byPoint },
      { label: t('inv.barcode'), value: v.barcode },
      { label: t('inv.weight'), value: v.weightG != null ? `${Number(v.weightG)} g` : null },
      { label: t('inv.statusField'), value: v.status },
    ] as { label: string; value: string | null | undefined }[];
  };

  const renderItem = (c: Computed) => (
    <details key={c.variant.id} className="border-b border-karni-100 last:border-0">
      <summary className="flex items-center gap-3 py-2 cursor-pointer" style={{ listStyle: 'none' }}>
        <Thumb src={c.variant.imageUrl} alt={c.variant.designName} size={12} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{c.variant.designName}
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {[c.variant.color, c.variant.size].filter(Boolean).join(' · ')}</span>
          </p>
          <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{c.variant.sku}</p>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <span className={chipClass(c.status)}>{c.qty}</span>
            {c.value > 0 && <p className="text-[10px] mt-1 tabular-nums" style={{ color: 'var(--ink-soft)' }}>{formatAmd(c.value)}</p>}
          </div>
          <svg className="opacity-50" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </summary>
      <div className="pb-3 pt-1 pl-[60px]">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          {fieldsFor(c).map((f) => (f.value != null && f.value !== '') ? (
            <div key={f.label}>
              <dt className="uppercase text-[9px] tracking-wide font-semibold" style={{ color: 'var(--ink-faint)' }}>{f.label}</dt>
              <dd className="font-medium" style={{ color: 'var(--ink)' }}>{f.value}</dd>
            </div>
          ) : null)}
        </dl>
        <Link href={`/admin/products/${c.variant.id}`} className="btn-link text-xs mt-2 inline-block">{t('inv.openProduct')}</Link>
      </div>
    </details>
  );

  const groups = [
    { key: 'out', label: t('inv.statusOut'), chip: 'chip chip-danger', items: outItems },
    { key: 'low', label: t('inv.statusLow'), chip: 'chip chip-warn', items: lowItems },
    { key: 'in', label: t('inv.statusIn'), chip: 'chip chip-ok', items: healthyItems },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('inv.title')}</h1>
        <p className="page-subtitle">{t('inv.subtitle')}</p>
      </header>

      <InventoryFilters
        categories={allCategories}
        collections={allCollections}
        subcollections={allSubcollections}
        sizes={allSizes}
        colors={allColors}
        sellingPoints={sellingPoints}
      />

      {/* HERO summary */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>
            {activeChips.length > 0 ? t('an.filteredView') : t('inv.allInventory')}
          </span>
          {activeChips.map((c) => (
            <span key={c.label + c.value}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
              <span style={{ opacity: 0.7 }}>{c.label}:</span> {c.value}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('inv.variants')}</p>
            <p className="display text-4xl font-semibold mt-1">{visible.length.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('inv.totalUnits')}</p>
            <p className="display text-3xl font-semibold mt-1">{totalUnits.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('inv.stockValue')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalValue)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('inv.statusOut')}</p>
            <p className="display text-3xl font-semibold mt-1">{outCount.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* Stock status breakdown */}
      <section className="grid md:grid-cols-2 gap-3">
        <div className="card">
          <div className="flex items-baseline justify-between mb-3 gap-2">
            <p className="font-semibold">{t('inv.byStatus')}</p>
            <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>
              {computed.length.toLocaleString()} {t('inv.variants').toLowerCase()}
            </span>
          </div>
          <ul className="space-y-3">
            {statusRows.map((s) => (
              <li key={s.key}>
                <div className="flex justify-between items-baseline text-xs mb-1">
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>{s.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-soft)' }}>{s.count.toLocaleString()}</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tint)' }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(s.count / statusMax) * 100}%`, background: s.color }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3 content-start">
          <MetricCard label={t('inv.avgPrice')} value={formatAmd(avgUnitPrice)} />
          <MetricCard label={t('inv.statusIn')} value={inCount.toLocaleString()} sub={`${lowCount} ${t('inv.statusLow').toLowerCase()}`} />
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>{t('inv.empty')}</div>
      ) : (
        <>
          {totalUnits > 0 && (
            <>
              <section className="grid md:grid-cols-2 gap-3">
                <div className="card">
                  <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.byCategory')}</p>
                  <BarChart data={catData} />
                </div>
                <div className="card">
                  <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.bySellingPoint')}</p>
                  <BarChart data={spData} />
                </div>
              </section>

              <section className="grid md:grid-cols-2 gap-3">
                <div className="card">
                  <p className="font-semibold mb-3">{t('an.valueBy')} {t('an.byCollection')}</p>
                  <DonutChart slices={collData} total={collData.reduce((s, d) => s + d.value, 0)} />
                </div>
                <div className="card">
                  <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.bySize')}</p>
                  <BarChart data={sizeData} />
                </div>
              </section>

              <section className="card">
                <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.byColor')}</p>
                <BarChart data={colorData} />
              </section>
            </>
          )}

          {/* Detailed, expandable item groups. Out-of-stock and low-stock get
              their own sections so every field can be drilled into. Tap a row
              to reveal the full data. */}
          {groups.map((g) => (
            <section key={g.key} className="card">
              <div className="flex items-center justify-between mb-2 gap-2">
                <p className="font-semibold flex items-center gap-2">
                  <span className={g.chip}>{g.items.length.toLocaleString()}</span> {g.label}
                </p>
                <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {g.items.length > LIST_CAP
                    ? `${t('c.showing')} ${LIST_CAP} ${t('c.of')} ${g.items.length.toLocaleString()}`
                    : t('inv.tapForDetail')}
                </span>
              </div>
              <div>{g.items.slice(0, LIST_CAP).map(renderItem)}</div>
              {g.items.length > LIST_CAP && (
                <p className="text-xs text-center mt-3" style={{ color: 'var(--ink-soft)' }}>{t('inv.refineHint')}</p>
              )}
            </section>
          ))}
        </>
      )}

      {/* Audit log */}
      <section className="card">
        <p className="font-semibold mb-3">{t('inv.movements')}</p>
        <ul className="space-y-2">
          {recentMovements.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={10} />
              <div className="flex-1 min-w-0">
                <p className="text-sm"><span className="chip mr-1">{m.type}</span>{m.variant.designName} <span className="text-xs text-karni-700">({m.variant.color || ''})</span></p>
                <p className="text-xs text-karni-700">{m.sellingPoint.name} · {t('o.by').toLowerCase()} {m.performedBy.fullName} · {m.createdAt.toLocaleString()}</p>
              </div>
              <span className={m.qtyDelta < 0 ? 'chip chip-danger' : 'chip chip-ok'}>
                {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
              </span>
            </li>
          ))}
          {recentMovements.length === 0 && <li className="text-karni-700 text-center py-4 text-sm">—</li>}
        </ul>
      </section>
    </div>
  );
}
