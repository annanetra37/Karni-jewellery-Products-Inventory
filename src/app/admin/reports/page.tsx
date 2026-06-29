import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { reconcileSessions, isMismatch } from '@/lib/reconcile';
import { expectedCloseBySession } from '@/lib/shiftCash';
import Link from 'next/link';

export default async function ReportsPage() {
  await requireAdmin();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

  // Exchange purchases are paid with returned credit, not new money — exclude
  // them from every revenue figure. Returns then reduce revenue by their net
  // credit (goods returned − goods taken in exchange).
  const realSale = { returnAsExchange: { is: null } as const };
  const [todayAgg, weekAgg, byPoint, bySalesperson, topSkus, recentSessions,
         todayRet, weekRet] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmd: true }, _count: true, where: { createdAt: { gte: dayStart }, ...realSale } }),
    prisma.sale.aggregate({ _sum: { totalAmd: true }, _count: true, where: { createdAt: { gte: weekStart }, ...realSale } }),
    prisma.sale.groupBy({
      by: ['sellingPointId'], _sum: { totalAmd: true }, _count: true,
      where: { createdAt: { gte: weekStart }, ...realSale },
    }),
    prisma.sale.groupBy({
      by: ['soldById'], _sum: { totalAmd: true }, _count: true,
      where: { createdAt: { gte: weekStart }, ...realSale },
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
    prisma.saleReturn.aggregate({ _sum: { returnedAmd: true, exchangeAmd: true }, where: { createdAt: { gte: dayStart } } }),
    prisma.saleReturn.aggregate({ _sum: { returnedAmd: true, exchangeAmd: true }, where: { createdAt: { gte: weekStart } } }),
  ]);
  // Net refund = goods returned − goods taken in exchange (negative = customer
  // paid extra, which adds to revenue).
  const netRefund = (a: { _sum: { returnedAmd: unknown; exchangeAmd: unknown } }) =>
    Number(a._sum.returnedAmd ?? 0) - Number(a._sum.exchangeAmd ?? 0);
  const todayRevenue = Number(todayAgg._sum.totalAmd ?? 0) - netRefund(todayRet);
  const weekRevenue = Number(weekAgg._sum.totalAmd ?? 0) - netRefund(weekRet);
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
  const depositRows = await prisma.safeTransaction.findMany({ where: { type: 'DEPOSIT' }, select: { id: true, sellingPointId: true, occurredAt: true, amountAmd: true, fromDrawer: true } });
  const expMap = await expectedCloseBySession(allSessions.map((s) => ({
    id: s.id, sellingPointId: s.sellingPointId, openingAt: s.openingAt, closingAt: s.closingAt,
    openingCountAmd: s.openingCountAmd == null ? null : Number(s.openingCountAmd),
  })));
  const { byId: reconById } = reconcileSessions(
    allSessions.map((s) => ({
      id: s.id, sellingPointId: s.sellingPointId, pointName: s.sellingPoint.name, status: s.status,
      openingAt: s.openingAt, openingCountAmd: s.openingCountAmd == null ? null : Number(s.openingCountAmd),
      closingAt: s.closingAt, closingCountAmd: s.closingCountAmd == null ? null : Number(s.closingCountAmd),
      expectedCloseAmd: expMap.get(s.id) ?? null,
    })),
    depositRows.map((d) => ({ id: d.id, sellingPointId: d.sellingPointId, occurredAt: d.occurredAt, amountAmd: Number(d.amountAmd), fromDrawer: d.fromDrawer })),
  );

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
          <p className="text-karni-700">{formatAmd(todayRevenue)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-karni-700">Last 7 days</p>
          <p className="font-bold">{weekAgg._count} sales</p>
          <p className="text-karni-700">{formatAmd(weekRevenue)}</p>
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
        <p className="font-medium mb-1">Cash sessions</p>
        <p className="text-xs text-karni-700 mb-3">Tap a session to see exactly how the close and handover figures are calculated.</p>
        <ul className="space-y-1.5">
          {recentSessions.map((s) => {
            const r = reconById.get(s.id);
            const opening = Number(s.openingCountAmd);
            const closing = s.closingCountAmd == null ? null : Number(s.closingCountAmd);
            const closeDiff = r?.closeDiff ?? null;
            const closeBad = isMismatch(closeDiff);
            const hHas = r != null && r.handoverDiff != null;
            const hBad = isMismatch(r?.handoverDiff);
            return (
              <li key={s.id}>
                <details className="border-b border-karni-100 pb-1.5">
                  <summary className="cursor-pointer select-none flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{s.openingAt.toLocaleDateString()}</span>
                      <span className="text-karni-700"> · {s.sellingPoint.name} · {s.user.fullName}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs shrink-0">
                      <span>{formatAmd(opening)} → {closing != null ? formatAmd(closing) : '—'}</span>
                      <span className={closeBad ? 'chip chip-danger' : 'chip chip-ok'}>{closing == null ? 'close —' : closeBad ? `close ${formatAmd(closeDiff!)}` : 'close OK'}</span>
                      <span className={hBad ? 'chip chip-danger' : 'chip chip-ok'}>{!hHas ? 'handover —' : hBad ? `handover ${formatAmd(r!.handoverDiff!)}` : 'handover OK'}</span>
                    </span>
                  </summary>

                  <div className="mt-2 pl-1 text-xs space-y-2" style={{ color: 'var(--ink-soft)' }}>
                    {/* Close-of-shift calculation */}
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>Close of shift (drawer vs sales)</p>
                      {closing == null || r == null ? (
                        <p>Shift still open — not closed yet.</p>
                      ) : (
                        <>
                          <p>Expected close = opening {formatAmd(opening)} + cash sales during shift {r.cashSales != null ? formatAmd(r.cashSales) : '—'}{r.fromDrawerDuringShift > 0 && <> − cash moved to safe mid-shift {formatAmd(r.fromDrawerDuringShift)}</>} = <b>{r.expectedClose != null ? formatAmd(r.expectedClose) : '—'}</b></p>
                          <p>Counted at close = <b>{formatAmd(closing)}</b></p>
                          <p>Close diff = <span className={closeBad ? 'text-red-700 font-semibold' : ''}>{closeDiff != null ? formatAmd(closeDiff) : '—'}</span> {closeBad ? '→ DISPUTED' : '→ OK'}</p>
                        </>
                      )}
                    </div>

                    {/* Handover calculation */}
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>Handover (today’s open vs yesterday’s close)</p>
                      {!hHas || r == null ? (
                        <p>No earlier closed shift at this point to compare against.</p>
                      ) : (
                        <>
                          <p>Expected open = previous close {formatAmd(r.priorClose!)} − drawer cash moved to safe after close {formatAmd(r.drawerToSafeAfterClose)} = <b>{formatAmd(r.expectedOpen!)}</b></p>
                          {r.nonDrawerToSafe > 0 && <p>({formatAmd(r.nonDrawerToSafe)} moved to safe was marked “not from the drawer” (e.g. after-hours sale) and excluded.)</p>}
                          <p>Opened with = <b>{formatAmd(r.opening)}</b></p>
                          <p>Handover diff = <span className={hBad ? 'text-red-700 font-semibold' : ''}>{formatAmd(r.handoverDiff!)}</span> {hBad ? '→ mismatch' : '→ OK'}</p>
                          {hBad && (
                            <p className="pt-0.5" style={{ color: 'var(--ink)' }}>
                              To fix: correct the opening count if mistyped, record a missing drawer→safe transfer, or mark an after-hours-sale deposit “not from the drawer” in Safe / Money.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
          {recentSessions.length === 0 && <li className="text-xs text-karni-700">No sessions yet.</li>}
        </ul>
      </section>
    </div>
  );
}
