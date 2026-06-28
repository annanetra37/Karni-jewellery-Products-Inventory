import { requireAdmin, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { BarChart } from '@/components/Charts';
import { Thumb } from '@/components/Thumb';
import { CheckinFilters } from '@/components/CheckinFilters';
import { Drilldown, DrillCard } from '../sales-analytics/Drilldown';
import { resolveRange } from '@/lib/dateRange';
import { formatYerevanDateTime, yerevanDayKey } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] || '') : v || '');

export default async function ReceiveAnalyticsPage({ searchParams }: { searchParams: Search }) {
  const me = await requireAdmin();
  const scope = await sellingPointScope(me);
  const { t, tl } = await getT();
  const sp = await searchParams;

  const who = arr(sp.who);
  const reqPoint = arr(sp.point);
  const point = scope === null ? reqPoint : reqPoint.filter((id) => scope.includes(id));
  const collection = arr(sp.collection);
  const category = arr(sp.category);
  const size = arr(sp.size);
  const color = arr(sp.color);
  const rr = resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to), defaultRange: 'all' });

  const createdAt: Prisma.DateTimeFilter = {};
  if (rr.startDate) createdAt.gte = rr.startDate;
  if (rr.startDate || rr.custom) createdAt.lte = rr.endDate;

  const variantWhere: Prisma.VariantWhereInput = {};
  if (collection.length) variantWhere.collection = { in: collection };
  if (category.length) variantWhere.category = { in: category };
  if (size.length) variantWhere.size = { in: size };
  if (color.length) variantWhere.color = { in: color };

  // Point scope: an explicit selection (already filtered to scope) wins; else a
  // point-scoped admin is confined to their own points.
  const pointWhere = point.length
    ? { sellingPointId: { in: point } }
    : (scope === null ? {} : { sellingPointId: { in: scope } });

  const where: Prisma.StockMovementWhereInput = {
    type: 'CHECKIN',
    ...(who.length ? { performedById: { in: who } } : {}),
    ...pointWhere,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(Object.keys(variantWhere).length ? { variant: variantWhere } : {}),
  };

  const [movements, checkinUsers, allSps, catRows, collRows, sizeRows, colorRows] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variant: { select: { id: true, designName: true, sku: true, collection: true, category: true, size: true, color: true, imageUrl: true, priceAmd: true } },
        sellingPoint: { select: { name: true } },
        performedBy: { select: { fullName: true } },
      },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    prisma.sellingPoint.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.variant.groupBy({ by: ['category'], where: { category: { not: null } }, orderBy: { category: 'asc' } }),
    prisma.variant.groupBy({ by: ['collection'], where: { collection: { not: null } }, orderBy: { collection: 'asc' } }),
    prisma.variant.groupBy({ by: ['size'], where: { size: { not: null } }, orderBy: { size: 'asc' } }),
    prisma.variant.groupBy({ by: ['color'], where: { color: { not: null } }, orderBy: { color: 'asc' } }),
  ]);
  const sellingPoints = scope === null ? allSps : allSps.filter((s) => scope.includes(s.id));
  const categories = catRows.map((r) => r.category!).filter(Boolean);
  const collections = collRows.map((r) => r.collection!).filter(Boolean);
  const sizes = sizeRows.map((r) => r.size!).filter(Boolean);
  const colors = colorRows.map((r) => r.color!).filter(Boolean);

  // ---- Aggregate.
  type CkLite = {
    id: string; when: string; who: string; point: string;
    product: string; sku: string; color: string | null; size: string | null;
    collection: string | null; category: string | null; qty: number; value: number;
  };
  const items: CkLite[] = [];
  let totalUnits = 0, totalValue = 0;
  const variantSet = new Set<string>();
  const byWho = new Map<string, { units: number; value: number; count: number }>();
  const byPoint = new Map<string, { units: number; value: number; count: number }>();
  const byCollection = new Map<string, { units: number; value: number; count: number }>();
  const byCategory = new Map<string, { units: number; value: number; count: number }>();
  const bySize = new Map<string, { units: number; value: number; count: number }>();
  const byColor = new Map<string, { units: number; value: number; count: number }>();
  const perVariant = new Map<string, { v: typeof movements[number]['variant']; units: number; value: number }>();
  const byDay = new Map<string, number>();
  const bump = (m: Map<string, { units: number; value: number; count: number }>, k: string | null | undefined, units: number, value: number) => {
    const key = k || '—';
    const e = m.get(key) || { units: 0, value: 0, count: 0 };
    e.units += units; e.value += value; e.count += 1; m.set(key, e);
  };

  for (const mv of movements) {
    const units = mv.qtyDelta;
    const price = Number(mv.variant.priceAmd);
    const value = units * price;
    totalUnits += units; totalValue += value;
    variantSet.add(mv.variant.id);
    items.push({
      id: mv.id, when: formatYerevanDateTime(mv.createdAt), who: mv.performedBy.fullName, point: mv.sellingPoint.name,
      product: mv.variant.designName, sku: mv.variant.sku, color: mv.variant.color, size: mv.variant.size,
      collection: mv.variant.collection, category: mv.variant.category, qty: units, value,
    });
    bump(byWho, mv.performedBy.fullName, units, value);
    bump(byPoint, mv.sellingPoint.name, units, value);
    bump(byCollection, mv.variant.collection, units, value);
    bump(byCategory, mv.variant.category, units, value);
    bump(bySize, mv.variant.size, units, value);
    bump(byColor, mv.variant.color, units, value);
    const pv = perVariant.get(mv.variant.id) || { v: mv.variant, units: 0, value: 0 };
    pv.units += units; pv.value += value; perVariant.set(mv.variant.id, pv);
    const dk = yerevanDayKey(mv.createdAt);
    byDay.set(dk, (byDay.get(dk) || 0) + units);
  }
  const checkins = movements.length;
  const avgUnits = checkins > 0 ? totalUnits / checkins : 0;
  const topVariants = Array.from(perVariant.values()).sort((a, b) => b.units - a.units).slice(0, 12);

  // Group the underlying check-ins for drill-downs.
  const groupBy = (keyFn: (i: CkLite) => string | null) => {
    const m = new Map<string, CkLite[]>();
    for (const it of items) { const k = keyFn(it) || '—'; (m.get(k) || m.set(k, []).get(k))!.push(it); }
    return m;
  };
  const itemsByWho = groupBy((i) => i.who);
  const itemsByPoint = groupBy((i) => i.point);
  const itemsByCollection = groupBy((i) => i.collection);
  const itemsByCategory = groupBy((i) => i.category);
  const itemsBySize = groupBy((i) => i.size);
  const itemsByColor = groupBy((i) => i.color);
  const itemsByVariant = groupBy((i) => i.sku);

  // ---- Renderers.
  const CAP = 100;
  const renderItems = (list: CkLite[]) =>
    list.length ? (
      <ul className="space-y-2.5">
        {list.slice(0, CAP).map((i) => (
          <li key={i.id} className="text-sm border-b border-karni-100 pb-2 last:border-0 last:pb-0">
            <div className="flex justify-between gap-2">
              <span className="font-medium truncate">{i.product}{i.color ? <span className="font-normal" style={{ color: 'var(--ink-soft)' }}> · {i.color}</span> : ''}</span>
              <span className="tabular-nums whitespace-nowrap">+{i.qty} · {formatAmd(i.value)}</span>
            </div>
            <p className="text-[11px] font-mono" style={{ color: 'var(--ink-soft)' }}>{i.sku}</p>
            <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{i.when} · {i.point} · {i.who}</p>
          </li>
        ))}
        {list.length > CAP && <li className="text-[11px] text-center pt-1" style={{ color: 'var(--ink-soft)' }}>+{list.length - CAP} {t('sa.more')}</li>}
      </ul>
    ) : <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>;

  const renderBreakdown = (m: Map<string, { units: number; value: number; count: number }>, group: Map<string, CkLite[]>, localize = false) => {
    const rows = Array.from(m.entries()).sort((a, b) => b[1].units - a[1].units);
    return (
      <ul className="space-y-1.5">
        {rows.map(([label, v]) => (
          <li key={label} className="border-b border-karni-100 pb-1.5 last:border-0">
            <Drilldown title={localize ? tl(label) : label} panel={renderItems(group.get(label) || [])}
              className="flex justify-between gap-2 text-sm hover:opacity-80 transition">
              <span className="truncate">{localize ? tl(label) : label}</span>
              <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{v.units} u. · {formatAmd(v.value)}</span>
            </Drilldown>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</li>}
      </ul>
    );
  };

  const toBar = (m: Map<string, { units: number; value: number; count: number }>, localize = false) =>
    Array.from(m.entries()).map(([label, v]) => ({ label: localize ? tl(label) : label, value: v.units, sub: formatAmd(v.value) })).sort((a, b) => b.value - a.value);
  const dayBars = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ label: k.slice(5), value: v }));

  const topWho = toBar(byWho)[0];
  const topPoint = toBar(byPoint)[0];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('ra.title')}</h1>
        <p className="page-subtitle">{t('ra.subtitle')}</p>
      </header>

      <CheckinFilters
        who={checkinUsers.map((u) => ({ id: u.id, name: u.fullName }))}
        points={sellingPoints.map((s) => ({ id: s.id, name: s.name }))}
        collections={collections} categories={categories} sizes={sizes} colors={colors}
        datePresets showSearch={false}
      />

      {/* HERO */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>
            {rr.custom ? `${rr.from} → ${rr.to}` : t(`sa.range${rr.range === 'today' ? 'Today' : rr.range === '7d' ? '7d' : rr.range === '90d' ? '90d' : rr.range === 'all' ? 'All' : '30d'}`)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Drilldown title={t('ra.unitsAdded')} panel={renderItems(items)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ra.unitsAdded')}</p>
            <p className="display text-4xl font-semibold mt-1 tabular-nums">{totalUnits.toLocaleString()}</p>
          </Drilldown>
          <Drilldown title={t('ra.checkins')} panel={renderItems(items)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ra.checkins')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{checkins.toLocaleString()}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--accent)' }}>{avgUnits.toFixed(1)} {t('ra.perCheckin')}</p>
          </Drilldown>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ra.variants')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{variantSet.size.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ra.stockValue')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums">{formatAmd(totalValue)}</p>
          </div>
        </div>
      </section>

      {checkins === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>{t('ra.empty')}</div>
      ) : (
        <>
          <p className="text-xs -mb-1" style={{ color: 'var(--ink-soft)' }}>{t('sa.tapHint')}</p>

          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <DrillCard label={t('ra.byWho')} value={topWho?.label || '—'} sub={topWho ? `${topWho.value} u.` : undefined}
              title={t('ra.byWho')} panel={renderBreakdown(byWho, itemsByWho)} />
            <DrillCard label={t('ra.byPoint')} value={topPoint?.label || '—'} sub={topPoint ? `${topPoint.value} u.` : undefined}
              title={t('ra.byPoint')} panel={renderBreakdown(byPoint, itemsByPoint)} />
            <DrillCard label={t('ra.byCollection')} value={String(byCollection.size)}
              title={t('ra.byCollection')} panel={renderBreakdown(byCollection, itemsByCollection, true)} />
            <DrillCard label={t('ra.byCategory')} value={String(byCategory.size)}
              title={t('ra.byCategory')} panel={renderBreakdown(byCategory, itemsByCategory, true)} />
            <DrillCard label={t('ra.bySize')} value={String(bySize.size)}
              title={t('ra.bySize')} panel={renderBreakdown(bySize, itemsBySize)} />
            <DrillCard label={t('ra.byColor')} value={String(byColor.size)}
              title={t('ra.byColor')} panel={renderBreakdown(byColor, itemsByColor)} />
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('ra.byWho')}</p>
                <Drilldown title={t('ra.byWho')} className="!w-auto btn-link text-xs" panel={renderBreakdown(byWho, itemsByWho)}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={toBar(byWho)} valueLabel={(n) => `${n} u.`} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('ra.byCollection')}</p>
                <Drilldown title={t('ra.byCollection')} className="!w-auto btn-link text-xs" panel={renderBreakdown(byCollection, itemsByCollection, true)}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={toBar(byCollection, true).slice(0, 10)} valueLabel={(n) => `${n} u.`} />
            </div>
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('ra.overTime')}</p>
            <BarChart data={dayBars} valueLabel={(n) => `${n} u.`} />
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('ra.topVariants')}</p>
            <ul className="space-y-2">
              {topVariants.map((it) => (
                <li key={it.v.id} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <Drilldown title={it.v.designName} panel={renderItems(itemsByVariant.get(it.v.sku) || [])}
                    className="flex items-center gap-3 hover:opacity-80 transition">
                    <Thumb src={it.v.imageUrl} alt={it.v.designName} size={12} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{it.v.designName}
                        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {[it.v.color, it.v.size].filter(Boolean).join(' · ')}</span>
                      </p>
                      <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{it.v.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold tabular-nums">{it.units} u.</p>
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{formatAmd(it.value)}</p>
                    </div>
                  </Drilldown>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
