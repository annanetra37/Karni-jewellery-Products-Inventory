import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { MetricCard, BarChart, DonutChart } from '@/components/Charts';
import { AnalyticsFilters } from '@/components/AnalyticsFilters';
import { Thumb } from '@/components/Thumb';

type Params = Promise<{
  category?: string;
  subcollection?: string;
  size?: string;
  color?: string;
  collection?: string;
  sellingPointId?: string;
}>;

function bucket(map: Map<string, { units: number; value: number }>, key: string | null | undefined, units: number, value: number) {
  const k = key ?? '—';
  const cur = map.get(k) || { units: 0, value: 0 };
  cur.units += units;
  cur.value += value;
  map.set(k, cur);
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin();
  const { t } = await getT();
  const sp = await searchParams;
  const category = (sp.category || '').trim();
  const collection = (sp.collection || '').trim();
  const subcollection = (sp.subcollection || '').trim();
  const size = (sp.size || '').trim();
  const color = (sp.color || '').trim();
  const sellingPointId = (sp.sellingPointId || '').trim();

  const rows = await prisma.inventoryItem.findMany({
    where: {
      quantity: { gt: 0 },
      ...(sellingPointId ? { sellingPointId } : {}),
      variant: {
        status: { not: 'ARCHIVED' },
        ...(category ? { category } : {}),
        ...(collection ? { collection } : {}),
        ...(subcollection ? { subcollection } : {}),
        ...(size ? { size } : {}),
        ...(color ? { color: { contains: color, mode: 'insensitive' } } : {}),
      },
    },
    include: {
      variant: { select: {
        id: true, sku: true, designName: true, category: true, collection: true, subcollection: true,
        size: true, color: true, priceAmd: true, costAmd: true, imageUrl: true, reorderPoint: true,
      } },
      sellingPoint: { select: { id: true, name: true } },
    },
  });

  let totalUnits = 0;
  let totalValue = 0;
  let totalCost = 0;
  let lowStockSkus = 0;
  const variantSet = new Set<string>();

  const byCategory = new Map<string, { units: number; value: number }>();
  const byCollection = new Map<string, { units: number; value: number }>();
  const bySubcollection = new Map<string, { units: number; value: number }>();
  const bySize = new Map<string, { units: number; value: number }>();
  const byColor = new Map<string, { units: number; value: number }>();
  const bySp = new Map<string, { units: number; value: number }>();
  const perVariant = new Map<string, { variant: typeof rows[number]['variant']; units: number; value: number }>();

  for (const r of rows) {
    const price = Number(r.variant.priceAmd);
    const lineValue = price * r.quantity;
    totalUnits += r.quantity;
    totalValue += lineValue;
    if (r.variant.costAmd) totalCost += Number(r.variant.costAmd) * r.quantity;
    if (r.quantity <= r.variant.reorderPoint) lowStockSkus++;
    variantSet.add(r.variant.id);
    bucket(byCategory, r.variant.category, r.quantity, lineValue);
    bucket(byCollection, r.variant.collection, r.quantity, lineValue);
    bucket(bySubcollection, r.variant.subcollection, r.quantity, lineValue);
    bucket(bySize, r.variant.size, r.quantity, lineValue);
    bucket(byColor, r.variant.color, r.quantity, lineValue);
    bucket(bySp, r.sellingPoint.name, r.quantity, lineValue);
    const pv = perVariant.get(r.variant.id) || { variant: r.variant, units: 0, value: 0 };
    pv.units += r.quantity;
    pv.value += lineValue;
    perVariant.set(r.variant.id, pv);
  }

  const avgUnitPrice = totalUnits > 0 ? totalValue / totalUnits : 0;
  const margin = totalCost > 0 && totalValue > 0 ? (totalValue - totalCost) / totalValue : null;

  const sortByUnits = (m: Map<string, { units: number; value: number }>) =>
    Array.from(m.entries()).map(([label, v]) => ({ label, value: v.units, sub: formatAmd(v.value) })).sort((a, b) => b.value - a.value);
  const sortByValue = (m: Map<string, { units: number; value: number }>) =>
    Array.from(m.entries()).map(([label, v]) => ({ label, value: Math.round(v.value), sub: `${v.units} u.` })).sort((a, b) => b.value - a.value);

  const catData = sortByUnits(byCategory);
  const collData = sortByValue(byCollection);
  const subData = sortByUnits(bySubcollection).slice(0, 12);
  const sizeData = sortByUnits(bySize);
  const colorData = sortByUnits(byColor).slice(0, 10);
  const spData = sortByUnits(bySp);
  const top = Array.from(perVariant.values()).sort((a, b) => b.value - a.value).slice(0, 10);

  // Facets for the filter dropdowns (unscoped — admin sees full catalog options)
  const facetsAll = await prisma.variant.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: { category: true, collection: true, subcollection: true, size: true },
  });
  const distinct = (arr: (string | null)[]) =>
    Array.from(new Set(arr.filter(Boolean) as string[])).sort();
  const allCategories = distinct(facetsAll.map((v) => v.category));
  const allCollections = distinct(facetsAll.map((v) => v.collection));
  const allSubcollections = distinct(facetsAll.map((v) => v.subcollection));
  const allSizes = distinct(facetsAll.map((v) => v.size));
  const sellingPoints = await prisma.sellingPoint.findMany({ orderBy: { name: 'asc' } });

  // Active filter chips (rendered server-side so the user sees the context clearly)
  const sellingPointName = sellingPointId ? sellingPoints.find((s) => s.id === sellingPointId)?.name : '';
  const activeChips: { label: string; value: string }[] = [
    category && { label: t('c.category'), value: category },
    collection && { label: t('c.collection'), value: collection },
    subcollection && { label: t('c.subcollection'), value: subcollection },
    size && { label: t('c.size'), value: size },
    color && { label: t('c.color'), value: color },
    sellingPointName && { label: t('c.sellingPoint'), value: sellingPointName },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('an.title')}</h1>
        <p className="page-subtitle">{t('an.subtitle')}</p>
      </header>

      <AnalyticsFilters
        categories={allCategories}
        collections={allCollections}
        subcollections={allSubcollections}
        sizes={allSizes}
        sellingPoints={sellingPoints.map((s) => ({ id: s.id, name: s.name }))}
      />

      {/* HERO summary — combined totals for the current filter set */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>
            {activeChips.length > 0 ? t('an.filteredView') : t('an.allInventory')}
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
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('an.unitsInStock')}</p>
            <p className="display text-4xl font-semibold mt-1">{totalUnits.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('an.totalValue')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalValue)}</p>
            {totalCost > 0 && (
              <p className="text-[11px] mt-1" style={{ color: 'rgba(244,236,217,0.7)' }}>
                {t('c.cost').toLowerCase()} {formatAmd(totalCost)}
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('an.variantsInStock')}</p>
            <p className="display text-3xl font-semibold mt-1">{variantSet.size.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('an.lowStock')}</p>
            <p className="display text-3xl font-semibold mt-1">{lowStockSkus.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* Secondary detail row */}
      {totalUnits > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label={t('an.avgPrice')} value={formatAmd(avgUnitPrice)} />
          {margin !== null && (
            <MetricCard label={t('an.estMargin')} value={`${(margin * 100).toFixed(1)}%`}
              sub={formatAmd(totalValue - totalCost)} />
          )}
          <MetricCard label={t('h.products')} value={variantSet.size.toLocaleString()}
            sub={`${rows.length} ${t('c.items')}`} />
        </section>
      )}

      {totalUnits === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>
          {t('an.empty')}
        </div>
      ) : (
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

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.byColor')}</p>
              <BarChart data={colorData} />
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.bySubcollection')}</p>
              <BarChart data={subData} />
            </div>
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('an.topValue')}</p>
            <ul className="space-y-2">
              {top.map((it) => (
                <li key={it.variant.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <Thumb src={it.variant.imageUrl} alt={it.variant.designName} size={12} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{it.variant.designName}
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {[it.variant.color, it.variant.size].filter(Boolean).join(' · ')}</span>
                    </p>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{it.variant.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold tabular-nums">{formatAmd(it.value)}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{it.units} u.</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
