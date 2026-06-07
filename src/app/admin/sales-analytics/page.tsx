import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { MetricCard, BarChart, DonutChart, LineChart } from '@/components/Charts';
import { SalesAnalyticsFilters } from '@/components/SalesAnalyticsFilters';
import { Thumb } from '@/components/Thumb';

type Params = Promise<{
  range?: string;     // today | 7d | 30d | 90d | all
  sellingPointId?: string; // comma list
  soldById?: string;       // comma list
  paymentMethod?: string;  // comma list
}>;

function bucket(map: Map<string, { count: number; revenue: number }>, key: string | null | undefined, count: number, revenue: number) {
  const k = key ?? '—';
  const cur = map.get(k) || { count: 0, revenue: 0 };
  cur.count += count;
  cur.revenue += revenue;
  map.set(k, cur);
}

function startOf(range: string): Date | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (range === 'today') return now;
  if (range === '7d') { const d = new Date(now); d.setDate(d.getDate() - 6); return d; }
  if (range === '30d') { const d = new Date(now); d.setDate(d.getDate() - 29); return d; }
  if (range === '90d') { const d = new Date(now); d.setDate(d.getDate() - 89); return d; }
  return null; // all time
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fillTimeline(start: Date | null, end: Date, rev: Map<string, number>) {
  if (!start) {
    // For "all", just return what we have, sorted ascending
    return Array.from(rev.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ label: day.slice(5), value }));
  }
  const points: { label: string; value: number }[] = [];
  const d = new Date(start);
  while (d <= end) {
    const key = dayKey(d);
    points.push({ label: key.slice(5), value: rev.get(key) || 0 });
    d.setDate(d.getDate() + 1);
  }
  return points;
}

export default async function SalesAnalyticsPage({ searchParams }: { searchParams: Params }) {
  await requireAdmin();
  const { t } = await getT();
  const sp = await searchParams;
  const split = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const range = (sp.range || '30d').trim();
  const sellingPointIds = split(sp.sellingPointId);
  const soldByIds = split(sp.soldById);
  const paymentMethods = split(sp.paymentMethod);

  const startDate = startOf(range);
  const now = new Date(); now.setHours(23, 59, 59, 999);

  const sales = await prisma.sale.findMany({
    where: {
      ...(startDate ? { createdAt: { gte: startDate, lte: now } } : {}),
      ...(sellingPointIds.length ? { sellingPointId: { in: sellingPointIds } } : {}),
      ...(soldByIds.length ? { soldById: { in: soldByIds } } : {}),
      ...(paymentMethods.length ? { paymentMethod: { in: paymentMethods as never } } : {}),
    },
    include: {
      sellingPoint: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
      customer: { select: { id: true, fullName: true } },
      lineItems: { include: { variant: { select: { id: true, sku: true, designName: true, category: true, collection: true, color: true, size: true, imageUrl: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  let totalCount = sales.length;
  let totalRevenue = 0;
  let totalUnits = 0;
  const customers = new Set<string>();
  const bySp = new Map<string, { count: number; revenue: number }>();
  const byPerson = new Map<string, { count: number; revenue: number }>();
  const byPay = new Map<string, { count: number; revenue: number }>();
  const byCat = new Map<string, { count: number; revenue: number }>();
  const byCollection = new Map<string, { count: number; revenue: number }>();
  const revByDay = new Map<string, number>();
  const perSku = new Map<string, { variant: typeof sales[number]['lineItems'][number]['variant']; units: number; revenue: number }>();
  const perCustomer = new Map<string, { name: string; count: number; revenue: number }>();

  for (const s of sales) {
    const r = Number(s.totalAmd);
    totalRevenue += r;
    if (s.customer) customers.add(s.customer.id);
    bucket(bySp, s.sellingPoint?.name, 1, r);
    bucket(byPerson, s.soldBy.fullName, 1, r);
    bucket(byPay, s.paymentMethod || 'OTHER', 1, r);
    const dKey = dayKey(s.createdAt);
    revByDay.set(dKey, (revByDay.get(dKey) || 0) + r);
    for (const li of s.lineItems) {
      const lineRev = Number(li.lineTotalAmd);
      totalUnits += li.quantity;
      bucket(byCat, li.variant.category, li.quantity, lineRev);
      bucket(byCollection, li.variant.collection, li.quantity, lineRev);
      const pv = perSku.get(li.variant.id) || { variant: li.variant, units: 0, revenue: 0 };
      pv.units += li.quantity;
      pv.revenue += lineRev;
      perSku.set(li.variant.id, pv);
    }
    if (s.customer) {
      const pc = perCustomer.get(s.customer.id) || { name: s.customer.fullName, count: 0, revenue: 0 };
      pc.count += 1;
      pc.revenue += r;
      perCustomer.set(s.customer.id, pc);
    }
  }

  const avgSale = totalCount > 0 ? totalRevenue / totalCount : 0;
  const sortByValue = (m: Map<string, { count: number; revenue: number }>) =>
    Array.from(m.entries())
      .map(([label, v]) => ({ label, value: Math.round(v.revenue), sub: `${v.count}×` }))
      .sort((a, b) => b.value - a.value);
  const sortByCount = (m: Map<string, { count: number; revenue: number }>) =>
    Array.from(m.entries())
      .map(([label, v]) => ({ label, value: v.count, sub: formatAmd(v.revenue) }))
      .sort((a, b) => b.value - a.value);

  const spData = sortByValue(bySp);
  const personData = sortByValue(byPerson);
  const payData = sortByValue(byPay);
  const catData = sortByCount(byCat);
  const collData = sortByValue(byCollection);
  const topSkus = Array.from(perSku.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const topCustomers = Array.from(perCustomer.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const timeline = fillTimeline(startDate, now, revByDay);

  const sellingPoints = await prisma.sellingPoint.findMany({ orderBy: { name: 'asc' } });
  const salespeople = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true },
  });

  const filterChips: { label: string; value: string }[] = [];
  if (sellingPointIds.length) {
    const names = sellingPointIds.map((id) => sellingPoints.find((s) => s.id === id)?.name || id);
    filterChips.push({ label: t('c.sellingPoint'), value: names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}` });
  }
  if (soldByIds.length) {
    const names = soldByIds.map((id) => salespeople.find((u) => u.id === id)?.fullName || id);
    filterChips.push({ label: t('sa.salesperson'), value: names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}` });
  }
  if (paymentMethods.length) {
    filterChips.push({ label: t('sa.paymentMethod'), value: paymentMethods.join(', ') });
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('sa.title')}</h1>
        <p className="page-subtitle">{t('sa.subtitle')}</p>
      </header>

      <SalesAnalyticsFilters
        sellingPoints={sellingPoints.map((s) => ({ id: s.id, name: s.name }))}
        salespeople={salespeople}
      />

      {/* HERO summary */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>
            {range === 'today' ? t('sa.rangeToday') :
             range === '7d' ? t('sa.range7d') :
             range === '30d' ? t('sa.range30d') :
             range === '90d' ? t('sa.range90d') :
             t('sa.rangeAll')}
          </span>
          {filterChips.map((c) => (
            <span key={c.label + c.value}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
              <span style={{ opacity: 0.7 }}>{c.label}:</span> {c.value}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.salesCount')}</p>
            <p className="display text-4xl font-semibold mt-1">{totalCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.revenue')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalRevenue)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.avgSale')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(avgSale)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.uniqueCustomers')}</p>
            <p className="display text-3xl font-semibold mt-1">{customers.size.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {totalCount === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>{t('sa.empty')}</div>
      ) : (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label={t('sa.unitsSold')} value={totalUnits.toLocaleString()} />
            <MetricCard label={t('sa.byPayment')} value={(payData[0]?.label || '—')}
              sub={payData[0] ? formatAmd(payData[0].value) : undefined} />
            <MetricCard label={t('sa.bySellingPoint')} value={(spData[0]?.label || '—')}
              sub={spData[0] ? formatAmd(spData[0].value) : undefined} />
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('sa.revenueOverTime')}</p>
            <LineChart series={timeline} formatValue={(n) => formatAmd(n)} />
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.bySellingPoint')}</p>
              <BarChart data={spData} valueLabel={(n) => formatAmd(n)} />
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.bySalesperson')}</p>
              <BarChart data={personData} valueLabel={(n) => formatAmd(n)} />
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.byPayment')}</p>
              <DonutChart slices={payData} total={payData.reduce((s, d) => s + d.value, 0)} />
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.byCategory')}</p>
              <BarChart data={catData.slice(0, 10)} />
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.byCollection')}</p>
              <BarChart data={collData} valueLabel={(n) => formatAmd(n)} />
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.topCustomers')}</p>
              <ul className="space-y-2">
                {topCustomers.map((c) => (
                  <li key={c.name} className="flex justify-between items-baseline text-sm border-b border-karni-100 pb-1.5 last:border-0">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{formatAmd(c.revenue)} · {c.count}×</span>
                  </li>
                ))}
                {topCustomers.length === 0 && <li className="text-sm text-center" style={{ color: 'var(--ink-soft)' }}>—</li>}
              </ul>
            </div>
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('sa.topSkus')}</p>
            <ul className="space-y-2">
              {topSkus.map((it) => (
                <li key={it.variant.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <Thumb src={it.variant.imageUrl} alt={it.variant.designName} size={12} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{it.variant.designName}
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {[it.variant.color, it.variant.size].filter(Boolean).join(' · ')}</span>
                    </p>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{it.variant.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold tabular-nums">{formatAmd(it.revenue)}</p>
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
