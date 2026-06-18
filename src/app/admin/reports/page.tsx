import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { reconcileHandovers } from '@/lib/reconcile';
import Link from 'next/link';

export default async function ReportsPage() {
  await requireAdmin();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

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

  // Live handover reconciliation (safe-aware, after-close-sale-aware), so the
  // opening-handover discrepancy is shown next to each session.
  const allSessions = await prisma.cashDrawerSession.findMany({
    where: { status: { in: ['CLOSED', 'DISPUTED', 'OPEN'] } },
    orderBy: { openingAt: 'asc' },
    include: { sellingPoint: { select: { name: true } } },
  });
  const earliest = allSessions[0]?.openingAt ?? new Date();
  const [depositRows, cashSaleRows] = await Promise.all([
    prisma.safeTransaction.findMany({ where: { type: 'DEPOSIT' }, select: { id: true, sellingPointId: true, occurredAt: true, amountAmd: true } }),
    prisma.sale.findMany({ where: { paymentMethod: 'CASH', createdAt: { gte: earliest } }, select: { sellingPointId: true, createdAt: true, totalAmd: true } }),
  ]);
  const { handovers } = reconcileHandovers(
    allSessions.map((s) => ({
      sellingPointId: s.sellingPointId, pointName: s.sellingPoint.name, status: s.status,
      openingAt: s.openingAt, openingCountAmd: s.openingCountAmd == null ? null : Number(s.openingCountAmd),
      closingAt: s.closingAt, closingCountAmd: s.closingCountAmd == null ? null : Number(s.closingCountAmd),
    })),
    depositRows.map((d) => ({ id: d.id, sellingPointId: d.sellingPointId, occurredAt: d.occurredAt, amountAmd: Number(d.amountAmd) })),
    cashSaleRows.map((c) => ({ sellingPointId: c.sellingPointId, createdAt: c.createdAt, totalAmd: Number(c.totalAmd) })),
  );
  const handoverByOpen = new Map<string, number>();
  for (const h of handovers) handoverByOpen.set(`${h.sellingPointId}|${h.openedAt.getTime()}`, h.diff);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Reports</h1>

      <section className="card space-y-2">
        <p className="font-medium">Production list (stock-outs + orders)</p>
        <p className="text-xs text-karni-700">
          View — in the portal — the products that went <b>low or out of stock because of a sale</b>
          plus <b>every open order</b> to produce, then download a CSV if needed.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary text-sm" href="/admin/production">Open production list →</Link>
          <a className="btn-secondary text-sm" href="/api/export/stockouts">Download all (CSV)</a>
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
            <th>When</th><th>Point</th><th>User</th><th>Open</th><th>Close</th><th>Close diff</th><th>Handover diff</th><th>Status</th>
          </tr></thead>
          <tbody>
            {recentSessions.map((s) => {
              const hDiff = handoverByOpen.get(`${s.sellingPointId}|${s.openingAt.getTime()}`);
              const hBad = hDiff != null && Math.abs(hDiff) > 0.01;
              return (
              <tr key={s.id} className="border-b border-karni-100">
                <td>{s.openingAt.toLocaleDateString()}</td>
                <td>{s.sellingPoint.name}</td>
                <td>{s.user.fullName}</td>
                <td>{formatAmd(Number(s.openingCountAmd))}</td>
                <td>{s.closingCountAmd != null ? formatAmd(Number(s.closingCountAmd)) : '—'}</td>
                <td className={s.discrepancyAmd != null && Math.abs(Number(s.discrepancyAmd)) > 0.001 ? 'text-red-700' : ''}>
                  {s.discrepancyAmd != null ? formatAmd(Number(s.discrepancyAmd)) : '—'}
                </td>
                <td className={hBad ? 'text-red-700 font-semibold' : ''}>
                  {hDiff == null ? '—' : hBad ? formatAmd(hDiff) : 'OK'}
                </td>
                <td>{s.status}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
