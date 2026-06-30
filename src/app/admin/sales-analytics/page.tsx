import Link from 'next/link';
import { requireAdmin, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { BarChart, DonutChart } from '@/components/Charts';
import { LineChartHover } from '@/components/LineChartHover';
import { SalesAnalyticsFilters } from '@/components/SalesAnalyticsFilters';
import { Thumb } from '@/components/Thumb';
import { Drilldown, DrillCard } from './Drilldown';
import { yerevanHour, yerevanWeekday, yerevanDayKey, yerevanISODate, formatYerevanDateTime } from '@/lib/datetime';
import { resolveRange } from '@/lib/dateRange';

type Params = Promise<{
  range?: string;     // today | 7d | 30d | 90d | all
  from?: string;      // YYYY-MM-DD custom range start
  to?: string;        // YYYY-MM-DD custom range end
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

function bumpN(map: Map<number, { count: number; revenue: number }>, key: number, revenue: number) {
  const cur = map.get(key) || { count: 0, revenue: 0 };
  cur.count += 1;
  cur.revenue += revenue;
  map.set(key, cur);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-first for the chart

function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

function fillTimeline(start: Date | null, end: Date, rev: Map<string, number>) {
  if (!start) {
    // For "all", just return what we have, sorted ascending
    return Array.from(rev.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ label: day.slice(5), value }));
  }
  // Step a Yerevan day at a time. Yerevan is a fixed UTC+4 (no DST), so adding
  // 24h to a Yerevan-midnight instant always lands on the next Yerevan midnight.
  const points: { label: string; value: number }[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const key = yerevanDayKey(new Date(t));
    points.push({ label: key.slice(5), value: rev.get(key) || 0 });
  }
  return points;
}

export default async function SalesAnalyticsPage({ searchParams }: { searchParams: Params }) {
  const me = await requireAdmin();
  const scope = await sellingPointScope(me);
  const { t } = await getT();
  const sp = await searchParams;
  const split = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const range = (sp.range || '30d').trim();
  const requestedSpIds = split(sp.sellingPointId);
  // Point-scoped admins are confined to their selling points; an out-of-scope
  // selection falls back to their full scope rather than leaking everything.
  let sellingPointIds: string[];
  if (scope === null) {
    sellingPointIds = requestedSpIds;
  } else {
    const inScope = requestedSpIds.filter((id) => scope.includes(id));
    sellingPointIds = inScope.length ? inScope : scope;
  }
  const saleSpWhere = scope === null
    ? (sellingPointIds.length ? { sellingPointId: { in: sellingPointIds } } : {})
    : { sellingPointId: { in: sellingPointIds } };
  const soldByIds = split(sp.soldById);
  const paymentMethods = split(sp.paymentMethod);

  const rr = resolveRange({ range, from: sp.from, to: sp.to, defaultRange: '30d' });
  const startDate = rr.startDate;
  const now = rr.endDate;

  const sales = await prisma.sale.findMany({
    where: {
      ...(startDate ? { createdAt: { gte: startDate, lte: now } } : {}),
      ...saleSpWhere,
      ...(soldByIds.length ? { soldById: { in: soldByIds } } : {}),
      ...(paymentMethods.length ? { paymentMethod: { in: paymentMethods as never } } : {}),
      // Exchange purchases aren't new revenue (paid with returned credit) and
      // never entered the drawer as cash — exclude them from every metric. Their
      // net effect is folded into `netRefund` below.
      returnAsExchange: { is: null },
    },
    include: {
      sellingPoint: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
      customer: { select: { id: true, fullName: true } },
      lineItems: { include: { variant: { select: { id: true, sku: true, designName: true, category: true, collection: true, color: true, size: true, imageUrl: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Days worked per salesperson — based on actual hours on shift, not calendar
  // days. A full ~12h shift counts as one day and a ~6h shift as half a day, so
  // we sum each person's hours on shift and snap the total to the nearest
  // half-day (6h). Breaks count as worked time, but are tallied separately so
  // they can be shown beneath each person. Open shifts run to "now"; a single
  // shift is capped at 24h to absorb a forgotten close.
  const HOURS_PER_DAY = 12;
  const nowMs = Date.now();
  // Hours are per PARTICIPANT, not per drawer: when two reps share one shift,
  // each person's own time on shift (join → leave / now) is counted, so both
  // get credit even though the drawer was opened once.
  const participations = await prisma.shiftParticipant.findMany({
    where: {
      ...(startDate ? { joinedAt: { gte: startDate, lte: now } } : {}),
      ...(soldByIds.length ? { userId: { in: soldByIds } } : {}),
      session: { ...saleSpWhere },
    },
    orderBy: { joinedAt: 'desc' },
    select: {
      userId: true, joinedAt: true, leftAt: true,
      user: { select: { fullName: true } },
      session: { select: { sellingPoint: { select: { name: true } }, breaks: { select: { startedAt: true, endedAt: true } } } },
    },
  });
  type ShiftRow = { in: string; out: string | null; hours: number; breakHours: number; breaks: number; point: string };
  const worked = new Map<string, { name: string; hours: number; breakHours: number; shifts: number; rows: ShiftRow[] }>();
  for (const p of participations) {
    const startMs = p.joinedAt.getTime();
    const endMs = p.leftAt?.getTime() ?? nowMs;
    const hours = Math.min(24, Math.max(0, (endMs - startMs) / 3_600_000));
    // Only count the part of each break that overlaps this person's time.
    let breakMs = 0;
    for (const b of p.session.breaks) {
      const bs = Math.max(startMs, b.startedAt.getTime());
      const be = Math.min(endMs, b.endedAt?.getTime() ?? nowMs);
      if (be > bs) breakMs += be - bs;
    }
    const e = worked.get(p.userId) || { name: p.user.fullName, hours: 0, breakHours: 0, shifts: 0, rows: [] };
    e.hours += hours; e.breakHours += breakMs / 3_600_000; e.shifts += 1;
    e.rows.push({
      in: formatYerevanDateTime(p.joinedAt),
      out: p.leftAt ? formatYerevanDateTime(p.leftAt) : null,
      hours, breakHours: breakMs / 3_600_000, breaks: p.session.breaks.length,
      point: p.session.sellingPoint?.name || '—',
    });
    worked.set(p.userId, e);
  }
  const daysWorkedData = Array.from(worked.values())
    .map((e) => ({ name: e.name, hours: e.hours, breakHours: e.breakHours, shifts: e.shifts, days: Math.round(e.hours / (HOURS_PER_DAY / 2)) / 2, rows: e.rows }))
    .sort((a, b) => b.hours - a.hours);

  // CSV export of check-in/out + breaks, honouring the current range and filters.
  const shiftExportParams = new URLSearchParams();
  if (rr.from) shiftExportParams.set('from', rr.from);
  shiftExportParams.set('to', rr.to);
  if (sellingPointIds.length) shiftExportParams.set('sellingPointId', sellingPointIds.join(','));
  if (soldByIds.length) shiftExportParams.set('userId', soldByIds.join(','));
  const shiftsExportHref = `/api/export/shifts?${shiftExportParams.toString()}`;

  let totalCount = sales.length;
  let totalRevenue = 0;
  let totalUnits = 0;
  let totalDiscount = 0;
  let toSafeRevenue = 0;
  let toSafeCount = 0;
  let walkIns = 0;
  const customers = new Set<string>();
  const bySp = new Map<string, { count: number; revenue: number }>();
  const byPerson = new Map<string, { count: number; revenue: number }>();
  const byPay = new Map<string, { count: number; revenue: number }>();
  const byCat = new Map<string, { count: number; revenue: number }>();
  const byCollection = new Map<string, { count: number; revenue: number }>();
  const byHour = new Map<number, { count: number; revenue: number }>();
  const byWeekday = new Map<number, { count: number; revenue: number }>();
  const revByDay = new Map<string, number>();
  const perSku = new Map<string, { variant: typeof sales[number]['lineItems'][number]['variant']; units: number; revenue: number }>();
  const perCustomer = new Map<string, { name: string; count: number; revenue: number }>();

  const addPay = (key: string, amt: number) => {
    if (amt <= 0) return;
    const e = byPay.get(key) || { count: 0, revenue: 0 };
    e.count += 1; e.revenue += amt; byPay.set(key, e);
  };
  for (const s of sales) {
    const r = Number(s.totalAmd);
    totalRevenue += r;
    totalDiscount += Number(s.discountAmd);
    if (s.customer) customers.add(s.customer.id); else walkIns += 1;
    bucket(bySp, s.sellingPoint?.name, 1, r);
    bucket(byPerson, s.soldBy.fullName, 1, r);
    // Allocate the amount to payment buckets, honouring a part-cash split:
    //  - the POS portion of a cash sale is really a card payment;
    //  - the safe portion (and the rest) stays cash, like an online sale.
    const method = s.paymentMethod || 'CASH';
    const nonDrawer = Number(s.nonDrawerAmd);
    const toPos = method === 'CASH' && !s.nonDrawerToSafe ? nonDrawer : 0;      // card via POS
    const toSafeSplit = method === 'CASH' && s.nonDrawerToSafe ? nonDrawer : 0; // cash to safe
    if (method === 'CASH') {
      addPay('CASH', r - toPos);
      addPay('CARD', toPos);
    } else {
      addPay(method, r);
    }
    // "To safe" overlay: full cash-to-safe (online) sales + safe split portions.
    const toSafe = (s.cashToSafe ? r : 0) + toSafeSplit;
    if (toSafe > 0) { toSafeRevenue += toSafe; toSafeCount += 1; }
    bumpN(byHour, yerevanHour(s.createdAt), r);
    bumpN(byWeekday, yerevanWeekday(s.createdAt), r);
    const dKey = yerevanDayKey(s.createdAt);
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

  // Returns/exchanges in the same window reduce revenue by their net credit
  // (goods returned − goods taken in exchange). A net-negative (customer paid
  // extra) correctly adds to revenue. `totalRevenue` here is gross real sales;
  // `netRevenue` is what's actually earned after returns.
  const returnsAgg = await prisma.saleReturn.aggregate({
    _sum: { returnedAmd: true, exchangeAmd: true }, _count: true,
    where: {
      ...(startDate ? { createdAt: { gte: startDate, lte: now } } : {}),
      ...saleSpWhere,
      ...(soldByIds.length ? { performedById: { in: soldByIds } } : {}),
    },
  });
  const grossRevenue = totalRevenue;
  const netRefund = Number(returnsAgg._sum.returnedAmd ?? 0) - Number(returnsAgg._sum.exchangeAmd ?? 0);
  const netRevenue = grossRevenue - netRefund;
  const avgSale = totalCount > 0 ? netRevenue / totalCount : 0;
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

  const avgItems = totalCount > 0 ? totalUnits / totalCount : 0;
  const repeatCustomers = Array.from(perCustomer.values()).filter((c) => c.count >= 2).length;

  // Time-of-day: peak hour + chronological distribution of hours that had sales.
  const peakHour = Array.from(byHour.entries()).sort((a, b) => b[1].count - a[1].count)[0] ?? null;
  const hourData = Array.from(byHour.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([h, v]) => ({ label: hourLabel(h), value: v.count, sub: formatAmd(v.revenue) }));

  // Day-of-week: busiest weekday + Mon-first distribution.
  const peakWeekday = Array.from(byWeekday.entries()).sort((a, b) => b[1].count - a[1].count)[0] ?? null;
  const weekdayData = WEEK_ORDER
    .filter((d) => byWeekday.has(d))
    .map((d) => ({ label: WEEKDAYS[d], value: byWeekday.get(d)!.count, sub: formatAmd(byWeekday.get(d)!.revenue) }));

  // ---- Interactive drill-down data: a light per-sale record + groupings, so
  // clicking a metric can reveal the underlying sales / customers / hours.
  type SaleLite = {
    saleNumber: string; when: string; customer: string; soldBy: string; sellingPoint: string;
    payment: string; total: number; discount: number; cashToSafe: boolean; weekday: number; hour: number;
    cashAmt: number; cardAmt: number; toSafeAmt: number; note: string;
    items: { name: string; qty: number; line: number; variantId: string }[];
  };
  const salesLite: SaleLite[] = sales.map((s) => {
    const total = Number(s.totalAmd);
    const method = s.paymentMethod || 'CASH';
    const nonDrawer = Number(s.nonDrawerAmd);
    const toPos = method === 'CASH' && !s.nonDrawerToSafe ? nonDrawer : 0;
    const toSafeSplit = method === 'CASH' && s.nonDrawerToSafe ? nonDrawer : 0;
    const cashAmt = method === 'CASH' ? total - toPos : 0;
    const cardAmt = (method === 'CARD' ? total : 0) + toPos;
    const note = s.cashToSafe ? 'online → safe'
      : toPos > 0 ? `split: ${formatAmd(toPos)} by card (POS)`
      : toSafeSplit > 0 ? `split: ${formatAmd(toSafeSplit)} to safe`
      : '';
    return {
      saleNumber: s.saleNumber,
      when: formatYerevanDateTime(s.createdAt),
      customer: s.customer?.fullName || 'Walk-in',
      soldBy: s.soldBy.fullName,
      sellingPoint: s.sellingPoint?.name || '—',
      payment: method,
      total,
      discount: Number(s.discountAmd),
      cashToSafe: s.cashToSafe,
      weekday: yerevanWeekday(s.createdAt),
      hour: yerevanHour(s.createdAt),
      cashAmt,
      cardAmt,
      toSafeAmt: (s.cashToSafe ? total : 0) + toSafeSplit,
      note,
      items: s.lineItems.map((li) => ({ name: li.variant.designName, qty: li.quantity, line: Number(li.lineTotalAmd), variantId: li.variant.id })),
    };
  });
  function groupSales(keyFn: (s: SaleLite) => string | string[]): Map<string, SaleLite[]> {
    const m = new Map<string, SaleLite[]>();
    for (const s of salesLite) {
      const k = keyFn(s);
      for (const key of Array.isArray(k) ? k : [k]) { const a = m.get(key) || []; a.push(s); m.set(key, a); }
    }
    return m;
  }
  const salesByCustomer = groupSales((s) => s.customer);
  const salesByHour = groupSales((s) => String(s.hour));
  const salesByWeekday = groupSales((s) => String(s.weekday));
  const salesBySku = groupSales((s) => [...new Set(s.items.map((i) => i.variantId))]);

  // ---- Panel renderers (server-rendered JSX handed to the Drilldown modal).
  const CAP = 80;
  const renderSales = (list: SaleLite[], amountOf?: (s: SaleLite) => number) => {
    if (!list.length) return <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>;
    return (
      <ul className="space-y-2.5">
        {list.slice(0, CAP).map((s) => {
          const amt = amountOf ? amountOf(s) : s.total;
          return (
          <li key={s.saleNumber} className="text-sm border-b border-karni-100 pb-2 last:border-0 last:pb-0">
            <div className="flex justify-between gap-2">
              <span className="font-medium truncate">{s.customer}</span>
              <span className="tabular-nums whitespace-nowrap">{formatAmd(amt)}{amt !== s.total ? <span className="opacity-60"> of {formatAmd(s.total)}</span> : null}</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{s.when} · {s.soldBy} · {s.sellingPoint} · {s.payment}{s.note ? ` · ${s.note}` : ''}</p>
            {s.items.length > 0 && <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{s.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>}
          </li>
          );
        })}
        {list.length > CAP && <li className="text-[11px] text-center pt-1" style={{ color: 'var(--ink-soft)' }}>+{list.length - CAP} {t('sa.more')}</li>}
      </ul>
    );
  };
  const renderNames = (rows: { name: string; sub?: string }[]) =>
    rows.length ? (
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.name + i} className="flex justify-between gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
            <span className="truncate">{r.name}</span>
            {r.sub && <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{r.sub}</span>}
          </li>
        ))}
      </ul>
    ) : <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>;
  const renderSkuBuyers = (variantId: string) => {
    const list = salesBySku.get(variantId) || [];
    return (
      <ul className="space-y-2.5">
        {list.slice(0, CAP).map((s) => {
          const qty = s.items.filter((i) => i.variantId === variantId).reduce((n, i) => n + i.qty, 0);
          return (
            <li key={s.saleNumber} className="flex justify-between gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
              <span className="min-w-0"><span className="font-medium truncate">{s.customer}</span>
                <span className="block text-[11px]" style={{ color: 'var(--ink-soft)' }}>{s.when} · {s.soldBy}</span></span>
              <span className="tabular-nums whitespace-nowrap">{qty}×</span>
            </li>
          );
        })}
      </ul>
    );
  };
  const renderHoursForWeekday = (wd: number) => {
    const list = salesByWeekday.get(String(wd)) || [];
    const byHr = new Map<number, { count: number; rev: number }>();
    for (const s of list) { const e = byHr.get(s.hour) || { count: 0, rev: 0 }; e.count += 1; e.rev += s.total; byHr.set(s.hour, e); }
    const rows = [...byHr.entries()].sort((a, b) => a[0] - b[0]);
    return (
      <>
        <p className="text-sm mb-2" style={{ color: 'var(--ink-soft)' }}>{list.length}× · {WEEKDAYS[wd]}</p>
        <ul className="space-y-1.5">
          {rows.map(([h, v]) => (
            <li key={h} className="flex justify-between gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
              <span>{hourLabel(h)}–{hourLabel((h + 1) % 24)}</span>
              <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{v.count}× · {formatAmd(v.rev)}</span>
            </li>
          ))}
        </ul>
      </>
    );
  };
  const renderBreakdown = (rows: { label: string; count: number; revenue: number }[]) => {
    const tot = rows.reduce((s, r) => s + r.revenue, 0);
    return (
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
              {formatAmd(r.revenue)} · {r.count}×{tot > 0 ? ` · ${Math.round((r.revenue / tot) * 100)}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    );
  };
  const renderBankToSafe = (rows: { when: string; amount: number; by: string; note: string | null }[]) =>
    rows.length ? (
      <ul className="space-y-2">
        {rows.slice(0, CAP).map((r, i) => (
          <li key={i} className="flex justify-between gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
            <span className="min-w-0"><span className="block">{r.when}</span>
              <span className="block text-[11px]" style={{ color: 'var(--ink-soft)' }}>{r.by}{r.note ? ` · ${r.note}` : ''}</span></span>
            <span className="tabular-nums whitespace-nowrap">{formatAmd(r.amount)}</span>
          </li>
        ))}
      </ul>
    ) : <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>;
  const toBreakdown = (m: Map<string, { count: number; revenue: number }>) =>
    Array.from(m.entries()).map(([label, v]) => ({ label, count: v.count, revenue: v.revenue })).sort((a, b) => b.revenue - a.revenue);
  // Sales behind each payment bucket (a split sale appears in both Cash and Card).
  const salesByPayBucket: Record<string, SaleLite[]> = {
    CASH: salesLite.filter((s) => s.cashAmt > 0),
    CARD: salesLite.filter((s) => s.cardAmt > 0),
    TRANSFER: salesLite.filter((s) => s.payment === 'TRANSFER'),
    OTHER: salesLite.filter((s) => s.payment === 'OTHER'),
  };
  // Payment breakdown whose rows drill into the underlying sales.
  const renderPaymentBreakdown = (rows: { label: string; count: number; revenue: number }[]) => {
    const tot = rows.reduce((s, r) => s + r.revenue, 0);
    return (
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="border-b border-karni-100 pb-1.5 last:border-0">
            <Drilldown title={r.label} panel={renderSales(salesByPayBucket[r.label] || [], r.label === 'CASH' ? (s) => s.cashAmt : r.label === 'CARD' ? (s) => s.cardAmt : undefined)}
              className="flex justify-between gap-2 text-sm hover:opacity-80 transition">
              <span className="truncate">{r.label}</span>
              <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
                {formatAmd(r.revenue)} · {r.count}×{tot > 0 ? ` · ${Math.round((r.revenue / tot) * 100)}%` : ''}
              </span>
            </Drilldown>
          </li>
        ))}
      </ul>
    );
  };
  const customerRows = Array.from(perCustomer.values()).sort((a, b) => b.revenue - a.revenue)
    .map((c) => ({ name: c.name, sub: `${formatAmd(c.revenue)} · ${c.count}×` }));
  const repeatRows = Array.from(perCustomer.values()).filter((c) => c.count >= 2).sort((a, b) => b.count - a.count)
    .map((c) => ({ name: c.name, sub: `${c.count}× · ${formatAmd(c.revenue)}` }));
  const skuUnitRows = Array.from(perSku.values()).sort((a, b) => b.units - a.units)
    .map((it) => ({ name: it.variant.designName, sub: `${it.units} u. · ${formatAmd(it.revenue)}` }));

  // Card-in-bank tracking (company-wide, all time): card revenue still sitting
  // in the bank = every card sale minus the card money moved into the safe.
  // Also a range-scoped bank→safe figure for the metric grid.
  const bankToSafeRangeWhere = { type: 'BANK_TO_SAFE' as const, ...(startDate ? { occurredAt: { gte: startDate, lte: now } } : {}) };
  // A "card" sale for these purposes = a CARD-method sale OR the POS portion of a
  // part-cash sale (cash sale, split to POS, not to safe).
  const posSplitWhere = { paymentMethod: 'CASH' as const, nonDrawerToSafe: false, nonDrawerAmd: { gt: 0 } };
  const [cardSalesAgg, posSplitAgg, bankToSafeAgg, bankToSafeRangeAgg, bankToSafeRangeTxs, cardSaleRows] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmd: true }, where: { paymentMethod: 'CARD' } }),
    prisma.sale.aggregate({ _sum: { nonDrawerAmd: true }, where: posSplitWhere }),
    prisma.safeTransaction.aggregate({ _sum: { amountAmd: true }, where: { type: 'BANK_TO_SAFE' } }),
    prisma.safeTransaction.aggregate({ _sum: { amountAmd: true }, _count: true, where: bankToSafeRangeWhere }),
    prisma.safeTransaction.findMany({ where: bankToSafeRangeWhere, orderBy: { occurredAt: 'desc' }, take: 100, include: { performedBy: { select: { fullName: true } } } }),
    prisma.sale.findMany({
      where: { OR: [{ paymentMethod: 'CARD' }, posSplitWhere] },
      orderBy: { createdAt: 'desc' }, take: 300,
      include: { customer: { select: { fullName: true } }, soldBy: { select: { fullName: true } }, sellingPoint: { select: { name: true } }, lineItems: { include: { variant: { select: { designName: true, id: true } } } } },
    }),
  ]);
  const cardSalesAll = Number(cardSalesAgg._sum.totalAmd ?? 0) + Number(posSplitAgg._sum.nonDrawerAmd ?? 0);
  const bankToSafeAll = Number(bankToSafeAgg._sum.amountAmd ?? 0);
  const cardInBank = cardSalesAll - bankToSafeAll; // all-time running balance
  // Card sales for the SELECTED period (filters applied) — the byPay 'CARD'
  // bucket already folds in the POS portion of part-cash sales.
  const cardSalesRange = Number(byPay.get('CARD')?.revenue ?? 0);
  const cardSalesAllList: SaleLite[] = cardSaleRows.map((s) => {
    const total = Number(s.totalAmd);
    const isSplit = (s.paymentMethod || 'CASH') === 'CASH';
    const cardAmt = isSplit ? Number(s.nonDrawerAmd) : total;
    return {
      saleNumber: s.saleNumber, when: formatYerevanDateTime(s.createdAt),
      customer: s.customer?.fullName || 'Walk-in', soldBy: s.soldBy.fullName, sellingPoint: s.sellingPoint?.name || '—',
      payment: s.paymentMethod || 'CASH', total, discount: Number(s.discountAmd), cashToSafe: s.cashToSafe,
      weekday: 0, hour: 0, cashAmt: total - cardAmt, cardAmt, toSafeAmt: 0,
      note: isSplit ? `split: ${formatAmd(cardAmt)} by card (POS)` : '',
      items: s.lineItems.map((li) => ({ name: li.variant.designName, qty: li.quantity, line: Number(li.lineTotalAmd), variantId: li.variant.id })),
    };
  });
  const bankToSafeRange = Number(bankToSafeRangeAgg._sum.amountAmd ?? 0);
  const bankToSafeRangeCount = bankToSafeRangeAgg._count;
  const bankToSafeRangeRows = bankToSafeRangeTxs.map((tx) => ({ when: formatYerevanDateTime(tx.occurredAt), amount: Number(tx.amountAmd), by: tx.performedBy.fullName, note: tx.note }));

  // ---- Safe / cash box analytics (company-wide). Balance is all-time; the
  // into/out figures are scoped to the selected period.
  const safeRangeWhere = startDate ? { occurredAt: { gte: startDate, lte: now } } : {};
  const [depAllAgg, wdAllAgg, depRangeAgg, wdRangeAgg, safeMovesAll, safeMovesRange] = await Promise.all([
    prisma.safeTransaction.aggregate({ _sum: { amountAmd: true }, where: { type: 'DEPOSIT' } }),
    prisma.safeTransaction.aggregate({ _sum: { amountAmd: true }, where: { type: 'WITHDRAWAL' } }),
    prisma.safeTransaction.aggregate({ _sum: { amountAmd: true }, _count: true, where: { type: 'DEPOSIT', ...safeRangeWhere } }),
    prisma.safeTransaction.aggregate({ _sum: { amountAmd: true }, _count: true, where: { type: 'WITHDRAWAL', ...safeRangeWhere } }),
    prisma.safeTransaction.findMany({ orderBy: { occurredAt: 'desc' }, take: 100, include: { owner: { select: { fullName: true } }, sellingPoint: { select: { name: true } }, performedBy: { select: { fullName: true } } } }),
    prisma.safeTransaction.findMany({ where: safeRangeWhere, orderBy: { occurredAt: 'desc' }, take: 100, include: { owner: { select: { fullName: true } }, sellingPoint: { select: { name: true } }, performedBy: { select: { fullName: true } } } }),
  ]);
  const depositsAll = Number(depAllAgg._sum.amountAmd ?? 0);
  const withdrawalsAll = Number(wdAllAgg._sum.amountAmd ?? 0);
  const safeBalance = depositsAll + bankToSafeAll - withdrawalsAll;
  const intoSafeRange = Number(depRangeAgg._sum.amountAmd ?? 0) + bankToSafeRange;
  const outOfSafeRange = Number(wdRangeAgg._sum.amountAmd ?? 0);
  type SafeMoveRow = { sign: number; amount: number; when: string; label: string; note: string | null };
  const mapSafeMoves = (txs: typeof safeMovesAll): SafeMoveRow[] => txs.map((tx) => ({
    sign: tx.type === 'WITHDRAWAL' ? -1 : 1,
    amount: Number(tx.amountAmd),
    when: formatYerevanDateTime(tx.occurredAt),
    label: tx.type === 'WITHDRAWAL'
      ? `${tx.splitAll ? 'Both owners' : tx.owner ? tx.owner.fullName : 'Withdrawal'}${tx.reason ? ` · ${tx.reason.toLowerCase()}` : ''}`
      : tx.type === 'BANK_TO_SAFE' ? 'POS → safe'
      : (tx.sellingPoint ? `From ${tx.sellingPoint.name}` : 'Deposit'),
    note: tx.note,
  }));
  const safeMovesAllRows = mapSafeMoves(safeMovesAll);
  const safeIntoRows = mapSafeMoves(safeMovesRange.filter((tx) => tx.type !== 'WITHDRAWAL'));
  const safeOutRows = mapSafeMoves(safeMovesRange.filter((tx) => tx.type === 'WITHDRAWAL'));
  const renderSafeMoves = (rows: SafeMoveRow[]) =>
    rows.length ? (
      <ul className="space-y-2">
        {rows.slice(0, 80).map((r, i) => (
          <li key={i} className="flex justify-between gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
            <span className="min-w-0"><span className="block truncate">{r.label}</span>
              <span className="block text-[11px]" style={{ color: 'var(--ink-soft)' }}>{r.when}{r.note ? ` · ${r.note}` : ''}</span></span>
            <span className={`tabular-nums whitespace-nowrap ${r.sign < 0 ? 'text-red-700' : ''}`}>{r.sign < 0 ? '−' : '+'}{formatAmd(r.amount)}</span>
          </li>
        ))}
      </ul>
    ) : <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>;

  const allSellingPoints = await prisma.sellingPoint.findMany({ orderBy: { name: 'asc' } });
  const sellingPoints = scope === null ? allSellingPoints : allSellingPoints.filter((s) => scope.includes(s.id));
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
            {rr.custom ? `${rr.from} → ${rr.to}` :
             range === 'today' ? t('sa.rangeToday') :
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
          <Drilldown title={t('sa.allSales')} panel={renderSales(salesLite)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.salesCount')}</p>
            <p className="display text-4xl font-semibold mt-1">{totalCount.toLocaleString()}</p>
          </Drilldown>
          <Drilldown title={t('sa.allSales')} panel={renderSales(salesLite)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.revenue')}{netRefund !== 0 && <span className="normal-case font-normal" style={{ opacity: 0.7 }}> ({t('sa.net')})</span>}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(netRevenue)}</p>
            {netRefund !== 0 && (
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>
                {formatAmd(grossRevenue)} {netRefund > 0 ? '−' : '+'} {formatAmd(Math.abs(netRefund))} {t('sa.refundsLabel')} ({returnsAgg._count})
              </p>
            )}
          </Drilldown>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.avgSale')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(avgSale)}</p>
          </div>
          <Drilldown title={t('sa.uniqueCustomers')} panel={renderNames(customerRows)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sa.uniqueCustomers')}</p>
            <p className="display text-3xl font-semibold mt-1">{customers.size.toLocaleString()}</p>
          </Drilldown>
        </div>
      </section>

      {totalCount === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>{t('sa.empty')}</div>
      ) : (
        <>
          <p className="text-xs -mb-1" style={{ color: 'var(--ink-soft)' }}>{t('sa.tapHint')}</p>
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <DrillCard label={t('sa.unitsSold')} value={totalUnits.toLocaleString()}
              sub={`${avgItems.toFixed(1)} ${t('sa.avgItems').toLowerCase()}`}
              title={t('sa.unitsSold')} panel={renderNames(skuUnitRows)} />
            <DrillCard label={t('sa.peakHour')}
              value={peakHour ? `${hourLabel(peakHour[0])}–${hourLabel((peakHour[0] + 1) % 24)}` : '—'}
              sub={peakHour ? `${peakHour[1].count}× · ${formatAmd(peakHour[1].revenue)}` : undefined}
              title={t('sa.peakHour')} panel={renderSales(peakHour ? (salesByHour.get(String(peakHour[0])) || []) : [])} />
            <DrillCard label={t('sa.peakDay')}
              value={peakWeekday ? WEEKDAYS[peakWeekday[0]] : '—'}
              sub={peakWeekday ? `${peakWeekday[1].count}× · ${formatAmd(peakWeekday[1].revenue)}` : undefined}
              title={t('sa.peakDay')} panel={peakWeekday ? renderHoursForWeekday(peakWeekday[0]) : renderSales([])} />
            <DrillCard label={t('sa.toSafe')} value={formatAmd(toSafeRevenue)}
              sub={`${toSafeCount}× · ${totalRevenue > 0 ? Math.round((toSafeRevenue / totalRevenue) * 100) : 0}%`}
              title={t('sa.toSafe')} panel={renderSales(salesLite.filter((s) => s.toSafeAmt > 0), (s) => s.toSafeAmt)} />
            <DrillCard label={t('sa.discounts')} value={formatAmd(totalDiscount)}
              title={t('sa.discounts')} panel={renderSales(salesLite.filter((s) => s.discount > 0))} />
            <DrillCard label={t('sa.repeatCustomers')} value={repeatCustomers.toLocaleString()}
              sub={t('sa.repeatCustomersSub').replace('{walkins}', walkIns.toLocaleString())}
              title={t('sa.repeatCustomers')} panel={renderNames(repeatRows)} />
            <DrillCard label={t('sa.cash')} value={formatAmd(byPay.get('CASH')?.revenue || 0)}
              sub={`${byPay.get('CASH')?.count || 0}×`}
              title={t('sa.cash')} panel={renderSales(salesByPayBucket.CASH, (s) => s.cashAmt)} />
            <DrillCard label={t('sa.card')} value={formatAmd(byPay.get('CARD')?.revenue || 0)}
              sub={`${byPay.get('CARD')?.count || 0}×`}
              title={t('sa.card')} panel={renderSales(salesByPayBucket.CARD, (s) => s.cardAmt)} />
            <DrillCard label={t('sa.byPayment')} value={(payData[0]?.label || '—')}
              sub={payData[0] ? formatAmd(payData[0].value) : undefined}
              title={t('sa.byPayment')} panel={renderPaymentBreakdown(toBreakdown(byPay))} />
            <DrillCard label={t('sa.bySellingPoint')} value={(spData[0]?.label || '—')}
              sub={spData[0] ? formatAmd(spData[0].value) : undefined}
              title={t('sa.bySellingPoint')} panel={renderBreakdown(toBreakdown(bySp))} />
            <DrillCard label={t('sa.bankToSafe')} value={formatAmd(bankToSafeRange)}
              sub={`${bankToSafeRangeCount}× · ${t('sa.thisRange')}`}
              title={t('sa.bankToSafe')} panel={renderBankToSafe(bankToSafeRangeRows)} />
          </section>

          <section className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold">{t('sa.cardTracking')}</p>
              <Drilldown title={t('sa.bankToSafe')} className="!w-auto btn-link text-xs" panel={renderBankToSafe(bankToSafeRangeRows)}>{t('sa.details')}</Drilldown>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Drilldown title={t('sa.cardSales')} panel={renderSales(salesByPayBucket.CARD, (s) => s.cardAmt)} className="hover:opacity-80 transition">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sa.cardSales')}</p>
                <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{formatAmd(cardSalesRange)}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{t('sa.thisRange')}</p>
              </Drilldown>
              <Drilldown title={t('sa.bankToSafe')} panel={renderBankToSafe(bankToSafeRangeRows)} className="hover:opacity-80 transition">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sa.bankToSafe')}</p>
                <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--ink-soft)' }}>−{formatAmd(bankToSafeRange)}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{t('sa.thisRange')}</p>
              </Drilldown>
              <Drilldown title={t('sa.cardInBank')} panel={renderSales(cardSalesAllList, (s) => s.cardAmt)} className="hover:opacity-80 transition">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent-deep)' }}>{t('sa.cardInBank')}</p>
                <p className="display text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--accent-deep)' }}>{formatAmd(cardInBank)}</p>
                <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{t('sa.allTime')}</p>
              </Drilldown>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--ink-soft)' }}>{t('sa.cardTrackingNote')}</p>
          </section>

          {/* Safe / cash box */}
          <section className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold">{t('sa.safeSection')}</p>
              <Link href="/admin/safe" className="btn-link text-xs">{t('sa.openSafe')}</Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Drilldown title={t('sa.safeMovements')} panel={renderSafeMoves(safeMovesAllRows)} className="hover:opacity-80 transition">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sa.inSafeNow')}</p>
                <p className="display text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{formatAmd(safeBalance)}</p>
              </Drilldown>
              <Drilldown title={t('sa.intoSafe')} panel={renderSafeMoves(safeIntoRows)} className="hover:opacity-80 transition">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sa.intoSafe')}</p>
                <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>+{formatAmd(intoSafeRange)}</p>
              </Drilldown>
              <Drilldown title={t('sa.outOfSafe')} panel={renderSafeMoves(safeOutRows)} className="hover:opacity-80 transition">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sa.outOfSafe')}</p>
                <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--ink-soft)' }}>−{formatAmd(outOfSafeRange)}</p>
              </Drilldown>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--ink-soft)' }}>{t('sa.safeNote')}</p>
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.byHour')}</p>
                <Drilldown title={t('sa.byHour')} className="!w-auto btn-link text-xs"
                  panel={renderBreakdown(Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]).map(([h, v]) => ({ label: `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`, count: v.count, revenue: v.revenue })))}>
                  {t('sa.details')}
                </Drilldown>
              </div>
              <BarChart data={hourData} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.byWeekday')}</p>
                <Drilldown title={t('sa.byWeekday')} className="!w-auto btn-link text-xs"
                  panel={renderBreakdown(WEEK_ORDER.filter((d) => byWeekday.has(d)).map((d) => ({ label: WEEKDAYS[d], count: byWeekday.get(d)!.count, revenue: byWeekday.get(d)!.revenue })))}>
                  {t('sa.details')}
                </Drilldown>
              </div>
              <BarChart data={weekdayData} />
            </div>
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('sa.revenueOverTime')}</p>
            <LineChartHover series={timeline} unit="֏" />
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.bySellingPoint')}</p>
                <Drilldown title={t('sa.bySellingPoint')} className="!w-auto btn-link text-xs" panel={renderBreakdown(toBreakdown(bySp))}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={spData} valueLabel={(n) => formatAmd(n)} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.bySalesperson')}</p>
                <Drilldown title={t('sa.bySalesperson')} className="!w-auto btn-link text-xs" panel={renderBreakdown(toBreakdown(byPerson))}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={personData} valueLabel={(n) => formatAmd(n)} />
            </div>
          </section>

          <section className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold">{t('sa.daysWorked')}</p>
              <a href={shiftsExportHref} className="btn-link text-xs inline-flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t('sa.exportShifts')}
              </a>
            </div>
            {daysWorkedData.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('sa.noShifts')}</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {daysWorkedData.map((d) => (
                  <li key={d.name} className="py-1">
                    <details className="group">
                      <summary className="flex items-center justify-between gap-3 py-1.5 cursor-pointer select-none" style={{ listStyle: 'none' }}>
                        <div className="min-w-0">
                          <span className="text-sm inline-flex items-center gap-1">
                            <svg className="transition-transform group-open:rotate-90 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--ink-faint)' }}><polyline points="9 18 15 12 9 6" /></svg>
                            {d.name}
                          </span>
                          <span className="block text-[11px] tabular-nums pl-4" style={{ color: 'var(--ink-soft)' }}>
                            {d.hours.toFixed(1)}h · {d.shifts} {d.shifts === 1 ? t('sa.shift') : t('sa.shifts')}
                            {d.breakHours > 0 && <> · {d.breakHours.toFixed(1)}h {t('sa.breaks')}</>}
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {d.days} {d.days === 1 ? t('sa.day') : t('sa.days')}
                        </span>
                      </summary>
                      <ul className="mt-1 mb-2 pl-4 space-y-1.5">
                        {d.rows.map((r, i) => (
                          <li key={i} className="text-[11px] border-l-2 pl-2" style={{ borderColor: 'var(--border)', color: 'var(--ink-soft)' }}>
                            <span className="block tabular-nums" style={{ color: 'var(--ink)' }}>{r.in} → {r.out || t('sa.shiftOpen')}</span>
                            <span className="block tabular-nums">{r.point} · {r.hours.toFixed(1)}h{r.breaks > 0 ? ` · ${r.breaks} ${r.breaks === 1 ? t('sa.breakN') : t('sa.breaksN')} (${r.breakHours.toFixed(1)}h)` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.byPayment')}</p>
                <Drilldown title={t('sa.byPayment')} className="!w-auto btn-link text-xs" panel={renderPaymentBreakdown(toBreakdown(byPay))}>{t('sa.details')}</Drilldown>
              </div>
              <DonutChart slices={payData} total={payData.reduce((s, d) => s + d.value, 0)} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.byCategory')}</p>
                <Drilldown title={t('sa.byCategory')} className="!w-auto btn-link text-xs" panel={renderBreakdown(toBreakdown(byCat))}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={catData.slice(0, 10)} />
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('sa.byCollection')}</p>
                <Drilldown title={t('sa.byCollection')} className="!w-auto btn-link text-xs" panel={renderBreakdown(toBreakdown(byCollection))}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={collData} valueLabel={(n) => formatAmd(n)} />
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('sa.topCustomers')}</p>
              <ul className="space-y-2">
                {topCustomers.map((c) => (
                  <li key={c.name} className="border-b border-karni-100 pb-1.5 last:border-0">
                    <Drilldown title={c.name} panel={renderSales(salesByCustomer.get(c.name) || [])}
                      className="flex justify-between items-baseline gap-2 text-sm hover:opacity-80 transition">
                      <span className="font-medium truncate">{c.name}</span>
                      <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{formatAmd(c.revenue)} · {c.count}×</span>
                    </Drilldown>
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
                <li key={it.variant.id} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <Drilldown title={it.variant.designName} panel={renderSkuBuyers(it.variant.id)}
                    className="flex items-center gap-3 hover:opacity-80 transition">
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
