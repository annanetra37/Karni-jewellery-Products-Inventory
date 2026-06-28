import Link from 'next/link';
import { requireAdmin, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';
import { BarChart, DonutChart } from '@/components/Charts';
import { Drilldown, DrillCard } from '../sales-analytics/Drilldown';
import { formatYerevanDate, yerevanISODate } from '@/lib/datetime';

type Params = Promise<{ range?: string }>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RANGES: { key: string; labelKey: string; days: number | null }[] = [
  { key: 'today', labelKey: 'sa.rangeToday', days: 0 },
  { key: '7d', labelKey: 'sa.range7d', days: 7 },
  { key: '30d', labelKey: 'sa.range30d', days: 30 },
  { key: '90d', labelKey: 'sa.range90d', days: 90 },
  { key: 'all', labelKey: 'sa.rangeAll', days: null },
];

export default async function CustomerAnalyticsPage({ searchParams }: { searchParams: Params }) {
  const me = await requireAdmin();
  const scope = await sellingPointScope(me);
  const { t } = await getT();
  const sp = await searchParams;
  const range = (sp.range || '30d').trim();
  const rangeDef = RANGES.find((r) => r.key === range) ?? RANGES[2];

  const nowMs = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  // Start of the selected window (null = all time). "today" = last 24h-ish window.
  const rangeStart = rangeDef.days === null ? null : new Date(nowMs - (rangeDef.days || 1) * DAY);

  // Sales scope for point-restricted admins. Customers themselves are global.
  const saleScopeWhere = scope === null ? {} : { sellingPointId: { in: scope } };

  const [customers, saleStats] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fullName: true, phone: true, email: true, instagram: true,
        birthday: true, gender: true, isLoyalty: true, createdAt: true,
        createdBy: { select: { fullName: true } },
      },
    }),
    prisma.sale.groupBy({
      by: ['customerId'],
      where: { customerId: { not: null }, ...saleScopeWhere },
      _count: { _all: true },
      _sum: { totalAmd: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
  ]);

  const statById = new Map(saleStats.map((s) => [s.customerId as string, s]));

  type CustLite = {
    id: string; name: string; phone: string | null; email: string | null; instagram: string | null;
    gender: string | null; bday: string | null; isLoyalty: boolean; createdBy: string;
    createdAtMonth: string; registered: string;
    orders: number; revenue: number; lastSale: Date | null; lastSaleStr: string | null;
  };
  const rows: CustLite[] = customers.map((c) => {
    const st = statById.get(c.id);
    const last = st?._max.createdAt ?? null;
    return {
      id: c.id, name: c.fullName, phone: c.phone, email: c.email, instagram: c.instagram,
      gender: c.gender, bday: c.birthday ? c.birthday.toISOString().slice(5, 10) : null,
      isLoyalty: c.isLoyalty, createdBy: c.createdBy?.fullName || t('ca.unknown'),
      createdAtMonth: c.createdAt.toISOString().slice(0, 7),
      registered: formatYerevanDate(c.createdAt),
      orders: st?._count._all ?? 0,
      revenue: Number(st?._sum.totalAmd ?? 0),
      lastSale: last,
      lastSaleStr: last ? formatYerevanDate(last) : null,
    };
  });

  // ---- Aggregate metrics.
  const total = rows.length;
  const buyers = rows.filter((r) => r.orders > 0);
  const newInRange = rangeStart ? rows.filter((r) => customers.find((c) => c.id === r.id)!.createdAt >= rangeStart) : rows;
  const repeat = buyers.filter((r) => r.orders >= 2);
  const oneTime = buyers.filter((r) => r.orders === 1);
  const never = rows.filter((r) => r.orders === 0);
  const loyalty = rows.filter((r) => r.isLoyalty);
  const totalRevenue = buyers.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = buyers.reduce((s, r) => s + r.orders, 0);
  const avgLtv = buyers.length ? totalRevenue / buyers.length : 0;
  const avgOrders = buyers.length ? totalOrders / buyers.length : 0;

  const withPhone = rows.filter((r) => r.phone && r.phone.trim());
  const withEmail = rows.filter((r) => r.email && r.email.trim());
  const withInstagram = rows.filter((r) => r.instagram && r.instagram.trim());
  const missingContact = rows.filter((r) => !(r.phone?.trim() || r.email?.trim() || r.instagram?.trim()));

  // Lapsed = bought before but not in the last 90 days.
  const lapseCut = new Date(nowMs - 90 * DAY);
  const lapsed = buyers.filter((r) => r.lastSale && r.lastSale < lapseCut);

  // Birthdays: stored as date-only, compare MM-DD against today's window.
  const todayMd = yerevanISODate().slice(5, 10);
  const thisMonth = todayMd.slice(0, 2);
  const birthdaysMonth = rows.filter((r) => r.bday && r.bday.slice(0, 2) === thisMonth);
  // Upcoming 30 days (handles year wrap by comparing day-of-year offsets).
  const mdToOffset = (md: string) => {
    const [mm, dd] = md.split('-').map(Number);
    return (mm - 1) * 31 + dd; // coarse but monotonic within a year — fine for a 30d window
  };
  const todayOff = mdToOffset(todayMd);
  const upcoming = rows
    .filter((r) => r.bday)
    .map((r) => {
      let diff = mdToOffset(r.bday!) - todayOff;
      if (diff < 0) diff += 12 * 31;
      return { r, diff };
    })
    .filter((x) => x.diff >= 0 && x.diff <= 31)
    .sort((a, b) => a.diff - b.diff)
    .map((x) => x.r);

  // Breakdowns.
  const genderMap = new Map<string, CustLite[]>();
  for (const r of rows) { const k = r.gender?.trim() || t('ca.unknown'); (genderMap.get(k) || genderMap.set(k, []).get(k))!.push(r); }
  const acqMap = new Map<string, CustLite[]>();
  for (const r of rows) { const k = r.createdBy; (acqMap.get(k) || acqMap.set(k, []).get(k))!.push(r); }

  // New customers over the last 12 months.
  const monthKeys: string[] = [];
  const dNow = new Date(nowMs);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(dNow.getFullYear(), dNow.getMonth() - i, 1);
    monthKeys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  const newByMonth = new Map<string, number>();
  for (const r of rows) newByMonth.set(r.createdAtMonth, (newByMonth.get(r.createdAtMonth) || 0) + 1);
  const monthData = monthKeys.map((k) => ({ label: MONTHS[Number(k.slice(5, 7)) - 1], value: newByMonth.get(k) || 0 }));

  const topBySpend = [...buyers].sort((a, b) => b.revenue - a.revenue).slice(0, 15);
  const topByVisits = [...buyers].sort((a, b) => b.orders - a.orders).slice(0, 15);

  // ---- Renderers.
  const CAP = 100;
  const contactLine = (r: CustLite) => [
    r.phone?.trim(), r.email?.trim(), r.instagram?.trim() ? `@${r.instagram.trim().replace(/^@/, '')}` : null,
  ].filter(Boolean).join(' · ');
  const renderCustomers = (list: CustLite[], opts?: { sub?: (r: CustLite) => string }) =>
    list.length ? (
      <ul className="space-y-2.5">
        {list.slice(0, CAP).map((r) => (
          <li key={r.id} className="text-sm border-b border-karni-100 pb-2 last:border-0 last:pb-0">
            <div className="flex justify-between gap-2">
              <span className="font-medium truncate">{r.name}</span>
              <span className="tabular-nums whitespace-nowrap">
                {opts?.sub ? opts.sub(r) : `${formatAmd(r.revenue)} · ${r.orders}×`}
              </span>
            </div>
            {contactLine(r) && <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{contactLine(r)}</p>}
            <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              {r.lastSaleStr ? `${t('ca.last')}: ${r.lastSaleStr}` : t('ca.noPurchases')}
              {r.gender?.trim() ? ` · ${r.gender.trim()}` : ''}
              {r.bday ? ` · 🎂 ${r.bday}` : ''}
              {` · ${t('ca.registered')}: ${r.registered}`}
            </p>
          </li>
        ))}
        {list.length > CAP && <li className="text-[11px] text-center pt-1" style={{ color: 'var(--ink-soft)' }}>+{list.length - CAP} {t('sa.more')}</li>}
      </ul>
    ) : <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>;

  const renderBreakdown = (m: Map<string, CustLite[]>) => {
    const entries = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
    return (
      <ul className="space-y-1.5">
        {entries.map(([label, list]) => (
          <li key={label} className="border-b border-karni-100 pb-1.5 last:border-0">
            <Drilldown title={label} panel={renderCustomers(list)}
              className="flex justify-between gap-2 text-sm hover:opacity-80 transition">
              <span className="truncate">{label}</span>
              <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>
                {list.length} · {total > 0 ? Math.round((list.length / total) * 100) : 0}%
              </span>
            </Drilldown>
          </li>
        ))}
      </ul>
    );
  };

  const genderData = [...genderMap.entries()].map(([label, list]) => ({ label, value: list.length })).sort((a, b) => b.value - a.value);
  const contactPct = total > 0 ? Math.round(((total - missingContact.length) / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('ca.title')}</h1>
        <p className="page-subtitle">{t('ca.subtitle')}</p>
      </header>

      {/* Range selector — scopes "new customers" only; lifetime stats are all-time. */}
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={`?range=${r.key}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${r.key === range ? 'bg-karni-800 text-white border-karni-800' : 'border-karni-200 hover:border-karni-400'}`}
            style={r.key === range ? { background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' } : undefined}>
            {t(r.labelKey)}
          </Link>
        ))}
      </div>

      {/* HERO */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Drilldown title={t('ca.totalCustomers')} panel={renderCustomers(rows)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ca.totalCustomers')}</p>
            <p className="display text-4xl font-semibold mt-1">{total.toLocaleString()}</p>
          </Drilldown>
          <Drilldown title={t('ca.newCustomers')} panel={renderCustomers(newInRange)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ca.newCustomers')}</p>
            <p className="display text-3xl font-semibold mt-1">{newInRange.length.toLocaleString()}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--accent)' }}>{t(rangeDef.labelKey)}</p>
          </Drilldown>
          <Drilldown title={t('ca.purchasing')} panel={renderCustomers(buyers)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ca.purchasing')}</p>
            <p className="display text-3xl font-semibold mt-1">{buyers.length.toLocaleString()}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--accent)' }}>{total > 0 ? Math.round((buyers.length / total) * 100) : 0}%</p>
          </Drilldown>
          <Drilldown title={t('ca.topBySpend')} panel={renderCustomers(topBySpend)} className="hover:opacity-90 transition">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('ca.totalRevenue')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums">{formatAmd(totalRevenue)}</p>
          </Drilldown>
        </div>
      </section>

      {total === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>{t('ca.empty')}</div>
      ) : (
        <>
          <p className="text-xs -mb-1" style={{ color: 'var(--ink-soft)' }}>{t('sa.tapHint')}</p>

          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <DrillCard label={t('ca.repeat')} value={repeat.length.toLocaleString()}
              sub={`${buyers.length > 0 ? Math.round((repeat.length / buyers.length) * 100) : 0}% ${t('ca.purchasing').toLowerCase()}`}
              title={t('ca.repeat')} panel={renderCustomers([...repeat].sort((a, b) => b.orders - a.orders), { sub: (r) => `${r.orders}× · ${formatAmd(r.revenue)}` })} />
            <DrillCard label={t('ca.oneTime')} value={oneTime.length.toLocaleString()}
              title={t('ca.oneTime')} panel={renderCustomers(oneTime)} />
            <DrillCard label={t('ca.neverPurchased')} value={never.length.toLocaleString()}
              title={t('ca.neverPurchased')} panel={renderCustomers(never)} />
            <DrillCard label={t('ca.avgLtv')} value={formatAmd(avgLtv)}
              title={t('ca.topBySpend')} panel={renderCustomers(topBySpend)} />
            <DrillCard label={t('ca.avgOrders')} value={avgOrders.toFixed(1)}
              title={t('ca.topByVisits')} panel={renderCustomers(topByVisits, { sub: (r) => `${r.orders}× · ${formatAmd(r.revenue)}` })} />
            <DrillCard label={t('ca.loyalty')} value={loyalty.length.toLocaleString()}
              sub={`${total > 0 ? Math.round((loyalty.length / total) * 100) : 0}%`}
              title={t('ca.loyalty')} panel={renderCustomers(loyalty)} />
            <DrillCard label={t('ca.inactive')} value={lapsed.length.toLocaleString()}
              title={t('ca.inactive')} panel={renderCustomers([...lapsed].sort((a, b) => (a.lastSale!.getTime()) - (b.lastSale!.getTime())))} />
            <DrillCard label={t('ca.birthdaysMonth')} value={birthdaysMonth.length.toLocaleString()}
              title={t('ca.birthdaysMonth')} panel={renderCustomers([...birthdaysMonth].sort((a, b) => (a.bday! < b.bday! ? -1 : 1)))} />
            <DrillCard label={t('ca.missingContact')} value={missingContact.length.toLocaleString()}
              sub={`${contactPct}% ${t('ca.contactable')}`}
              title={t('ca.missingContact')} panel={renderCustomers(missingContact)} />
            <DrillCard label={t('ca.withPhone')} value={withPhone.length.toLocaleString()}
              title={t('ca.withPhone')} panel={renderCustomers(withPhone)} />
            <DrillCard label={t('ca.withEmail')} value={withEmail.length.toLocaleString()}
              title={t('ca.withEmail')} panel={renderCustomers(withEmail)} />
            <DrillCard label={t('ca.withInstagram')} value={withInstagram.length.toLocaleString()}
              title={t('ca.withInstagram')} panel={renderCustomers(withInstagram)} />
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('ca.byGender')}</p>
                <Drilldown title={t('ca.byGender')} className="!w-auto btn-link text-xs" panel={renderBreakdown(genderMap)}>{t('sa.details')}</Drilldown>
              </div>
              <DonutChart slices={genderData} total={genderData.reduce((s, d) => s + d.value, 0)} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{t('ca.byAcquisition')}</p>
                <Drilldown title={t('ca.byAcquisition')} className="!w-auto btn-link text-xs" panel={renderBreakdown(acqMap)}>{t('sa.details')}</Drilldown>
              </div>
              <BarChart data={[...acqMap.entries()].map(([label, list]) => ({ label, value: list.length })).sort((a, b) => b.value - a.value).slice(0, 10)} />
            </div>
          </section>

          <section className="card">
            <p className="font-semibold mb-3">{t('ca.newOverTime')}</p>
            <BarChart data={monthData} />
          </section>

          <section className="grid md:grid-cols-2 gap-3">
            <div className="card">
              <p className="font-semibold mb-3">{t('ca.topBySpend')}</p>
              <ul className="space-y-2">
                {topBySpend.slice(0, 10).map((c) => (
                  <li key={c.id} className="border-b border-karni-100 pb-1.5 last:border-0">
                    <Drilldown title={c.name} panel={renderCustomers([c])}
                      className="flex justify-between items-baseline gap-2 text-sm hover:opacity-80 transition">
                      <span className="font-medium truncate">{c.name}</span>
                      <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{formatAmd(c.revenue)} · {c.orders}×</span>
                    </Drilldown>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <p className="font-semibold mb-3">{t('ca.topByVisits')}</p>
              <ul className="space-y-2">
                {topByVisits.slice(0, 10).map((c) => (
                  <li key={c.id} className="border-b border-karni-100 pb-1.5 last:border-0">
                    <Drilldown title={c.name} panel={renderCustomers([c])}
                      className="flex justify-between items-baseline gap-2 text-sm hover:opacity-80 transition">
                      <span className="font-medium truncate">{c.name}</span>
                      <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{c.orders}× · {formatAmd(c.revenue)}</span>
                    </Drilldown>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-semibold">{t('ca.upcomingBirthdays')}</p>
              <Drilldown title={t('ca.upcomingBirthdays')} className="!w-auto btn-link text-xs" panel={renderCustomers(upcoming)}>{t('sa.details')}</Drilldown>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>—</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex justify-between items-baseline gap-2 text-sm border-b border-karni-100 pb-1.5 last:border-0">
                    <span className="min-w-0">
                      <span className="font-medium truncate">{c.name}</span>
                      {contactLine(c) && <span className="block text-[11px]" style={{ color: 'var(--ink-soft)' }}>{contactLine(c)}</span>}
                    </span>
                    <span className="tabular-nums whitespace-nowrap">🎂 {c.bday}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
