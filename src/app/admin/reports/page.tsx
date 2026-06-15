import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { yerevanISODate } from '@/lib/datetime';

export default async function ReportsPage() {
  await requireAdmin();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const today = yerevanISODate();
  const since7 = yerevanISODate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const since30 = yerevanISODate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [todayAgg, weekAgg, byPoint, bySalesperson, topSkus, recentSessions] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmd: true }, _count: true, where: { createdAt: { gte: dayStart } } }),
    prisma.sale.aggregate({ _sum: { totalAmd: true }, _count: true, where: { createdAt: { gte: weekStart } } }),
    prisma.sale.groupBy({
      by: ['sellingPointId'], _sum: { totalAmd: true }, _count: true,
      where: { createdAt: { gte: weekStart } },
    }),
    prisma.sale.groupBy({
      by: ['soldById'], _sum: { totalAmd: true }, _count: true,
      where: { createdAt: { gte: weekStart } },
    }),
    prisma.saleLineItem.groupBy({
      by: ['variantId'], _sum: { quantity: true, lineTotalAmd: true },
      orderBy: { _sum: { quantity: 'desc' } }, take: 10,
      where: { sale: { createdAt: { gte: weekStart } } },
    }),
    prisma.cashDrawerSession.findMany({
      orderBy: { openingAt: 'desc' }, take: 20,
      include: { sellingPoint: true, user: true, openingBy: true, closingBy: true },
    }),
  ]);
  const sps = await prisma.sellingPoint.findMany();
  const users = await prisma.user.findMany();
  const skuVariants = topSkus.length > 0
    ? await prisma.variant.findMany({ where: { id: { in: topSkus.map((t) => t.variantId) } } })
    : [];

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Reports</h1>

      <section className="card space-y-2">
        <p className="font-medium">Production list (stock-outs + orders)</p>
        <p className="text-xs text-karni-700">
          Export for the workshop: products that went <b>low or out of stock because of a sale</b>
          (with the date and collection/category), <b>plus every open order</b> (NEW / in progress)
          with its quantity, deadline and production specs. The date range below filters the
          stock-out rows; all open orders are always included.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary text-sm" href={`/api/export/stockouts?from=${since7}&to=${today}`}>Last 7 days (CSV)</a>
          <a className="btn-secondary text-sm" href={`/api/export/stockouts?from=${since30}&to=${today}`}>Last 30 days (CSV)</a>
          <a className="btn-secondary text-sm" href="/api/export/stockouts">All time (CSV)</a>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-karni-700">Today</p>
          <p className="font-bold">{todayAgg._count} sales</p>
          <p className="text-karni-700">{formatAmd(Number(todayAgg._sum.totalAmd ?? 0))}</p>
        </div>
        <div className="card">
          <p className="text-xs text-karni-700">Last 7 days</p>
          <p className="font-bold">{weekAgg._count} sales</p>
          <p className="text-karni-700">{formatAmd(Number(weekAgg._sum.totalAmd ?? 0))}</p>
        </div>
      </div>

      <section className="card">
        <p className="font-medium mb-2">Revenue by selling point (7d)</p>
        <ul className="text-sm">
          {byPoint.map((b) => (
            <li key={b.sellingPointId} className="flex justify-between border-b border-karni-100 py-1">
              <span>{sps.find((s) => s.id === b.sellingPointId)?.name}</span>
              <span>{formatAmd(Number(b._sum.totalAmd ?? 0))} ({b._count})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <p className="font-medium mb-2">Revenue by salesperson (7d)</p>
        <ul className="text-sm">
          {bySalesperson.map((b) => (
            <li key={b.soldById} className="flex justify-between border-b border-karni-100 py-1">
              <span>{users.find((u) => u.id === b.soldById)?.fullName}</span>
              <span>{formatAmd(Number(b._sum.totalAmd ?? 0))} ({b._count})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <p className="font-medium mb-2">Top-selling SKUs (7d)</p>
        <ul className="text-sm">
          {topSkus.map((t) => {
            const v = skuVariants.find((x) => x.id === t.variantId);
            return (
              <li key={t.variantId} className="flex justify-between border-b border-karni-100 py-1">
                <span>{v?.designName} <span className="text-xs text-karni-700">({v?.color})</span></span>
                <span>{t._sum.quantity}× · {formatAmd(Number(t._sum.lineTotalAmd ?? 0))}</span>
              </li>
            );
          })}
          {topSkus.length === 0 && <li className="text-karni-700">No sales yet.</li>}
        </ul>
      </section>

      <section className="card">
        <p className="font-medium mb-2">Cash sessions</p>
        <table className="w-full text-xs">
          <thead><tr className="text-left border-b border-karni-100">
            <th>When</th><th>Point</th><th>User</th><th>Open</th><th>Close</th><th>Diff</th><th>Status</th>
          </tr></thead>
          <tbody>
            {recentSessions.map((s) => (
              <tr key={s.id} className="border-b border-karni-100">
                <td>{s.openingAt.toLocaleDateString()}</td>
                <td>{s.sellingPoint.name}</td>
                <td>{s.user.fullName}</td>
                <td>{formatAmd(Number(s.openingCountAmd))}</td>
                <td>{s.closingCountAmd != null ? formatAmd(Number(s.closingCountAmd)) : '—'}</td>
                <td className={s.discrepancyAmd != null && Math.abs(Number(s.discrepancyAmd)) > 0.001 ? 'text-red-700' : ''}>
                  {s.discrepancyAmd != null ? formatAmd(Number(s.discrepancyAmd)) : '—'}
                </td>
                <td>{s.status}{s.handoverMismatch && ' ⚠'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
