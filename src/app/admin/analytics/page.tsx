import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { MetricCard, BarChart, DonutChart } from '@/components/Charts';
import { Thumb } from '@/components/Thumb';
import Link from 'next/link';

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

  // Pull every in-stock InventoryItem row matching the filters and aggregate
  // in JS. With ~5,000 max rows (474 variants × 10 SPs) this is fine.
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

  // Per-variant aggregate for "top by value"
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

  // Filter facets — derive from current rows so admin only sees options that
  // exist within the active filter set.
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
  const hasFilters = !!(category || collection || subcollection || size || color || sellingPointId);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('an.title')}</h1>
        <p className="page-subtitle">{t('an.subtitle')}</p>
      </header>

      {/* Filters */}
      <form className="card space-y-3" method="get" action="/admin/analytics">
        <p className="font-semibold text-sm" style={{ color: 'var(--brand-deep)' }}>{t('an.filters')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">{t('c.category')}</label>
            <select className="input" name="category" defaultValue={category}>
              <option value="">{t('c.allCategories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('c.collection')}</label>
            <select className="input" name="collection" defaultValue={collection}>
              <option value="">—</option>
              {allCollections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('c.subcollection')}</label>
            <select className="input" name="subcollection" defaultValue={subcollection}>
              <option value="">{t('c.anySubcollection')}</option>
              {allSubcollections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('c.size')}</label>
            <select className="input" name="size" defaultValue={size}>
              <option value="">{t('c.anySize')}</option>
              {allSizes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('c.color')}</label>
            <input className="input" name="color" defaultValue={color} placeholder={t('c.color')} />
          </div>
          <div>
            <label className="label">{t('c.sellingPoint')}</label>
            <select className="input" name="sellingPointId" defaultValue={sellingPointId}>
              <option value="">{t('c.allSellingPoints')}</option>
              {sellingPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {hasFilters && <Link href="/admin/analytics" className="btn-secondary">{t('an.clearFilters')}</Link>}
          <button type="submit" className="btn-primary">{t('an.applyFilters')}</button>
        </div>
      </form>

      {/* Metric cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label={t('an.unitsInStock')} value={totalUnits.toLocaleString()} />
        <MetricCard label={t('an.totalValue')} value={formatAmd(totalValue)}
          sub={totalCost > 0 ? `cost ${formatAmd(totalCost)}` : undefined} />
        <MetricCard label={t('an.variantsInStock')} value={variantSet.size.toLocaleString()} />
        <MetricCard label={t('an.lowStock')} value={lowStockSkus.toLocaleString()} />
      </section>

      {totalUnits === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>
          {t('an.empty')}
        </div>
      ) : (
        <>
          {/* Category + Selling point */}
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

          {/* Value by collection (donut) + size (bars) */}
          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <p className="font-semibold mb-3">{t('an.valueBy')} {t('an.byCollection')}</p>
              <DonutChart slices={collData} total={collData.reduce((s, d) => s + d.value, 0)} label={t('h.collectionPhotos').split(' ')[0].toLowerCase().includes('collection') ? '' : ''} />
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('an.unitsBy')} {t('an.bySize')}</p>
              <BarChart data={sizeData} />
            </div>
          </section>

          {/* Color + Subcollection */}
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

          {/* Top items table */}
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
