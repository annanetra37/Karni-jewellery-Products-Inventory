import { prisma } from './db';

export type CashSessionWindow = {
  id: string;
  sellingPointId: string;
  openingAt: Date;
  closingAt: Date | null;
  openingCountAmd: number | null;
};

/**
 * Live expected drawer close for each session:
 *
 *   opening float + cash that actually entered THIS drawer during the shift.
 *
 * "Cash that entered the drawer" = CASH sales at the point during
 * [openingAt, closingAt) that were NOT marked cash-to-safe. A cash-to-safe sale
 * is an online / delivery order whose money went straight to the safe (recorded
 * separately as a safe deposit), so it never touched the drawer and must not
 * inflate the expected close.
 *
 * This is computed from the CURRENT sales rather than the value frozen at close,
 * so toggling cash-to-safe, editing an amount, or re-pointing a sale is
 * reflected immediately in reconciliation. Returns null for a session with no
 * opening count. The result is fed into `reconcileSessions` as `expectedCloseAmd`
 * (which still layers safe transfers on top).
 *
 * A return/exchange carries its whole net cash effect as a signed
 * `drawerDeltaAmd` (negative = cash refunded out) attributed to a chosen
 * `cashSessionId` — the drawer the cash actually moved through — so it lands on
 * the right shift even when recorded later. Where no session was chosen it falls
 * back to matching by time. The exchange half is excluded from the cash-sales
 * sum (it was paid with returned credit, not new money — its cash, if any, is
 * already in `drawerDeltaAmd`).
 */
export async function expectedCloseBySession(
  sessions: CashSessionWindow[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (sessions.length === 0) return out;

  const pointIds = [...new Set(sessions.map((s) => s.sellingPointId))];
  const earliest = sessions.reduce((min, s) => (s.openingAt < min ? s.openingAt : min), sessions[0].openingAt);
  const sessionIds = new Set(sessions.map((s) => s.id));

  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        sellingPointId: { in: pointIds },
        paymentMethod: 'CASH',
        cashToSafe: false,
        createdAt: { gte: earliest },
        returnAsExchange: { is: null },
      },
      select: { sellingPointId: true, totalAmd: true, nonDrawerAmd: true, createdAt: true },
    }),
    prisma.saleReturn.findMany({
      where: {
        OR: [
          { cashSessionId: { in: [...sessionIds] } },
          { cashSessionId: null, sellingPointId: { in: pointIds }, createdAt: { gte: earliest } },
        ],
      },
      select: { sellingPointId: true, cashSessionId: true, drawerDeltaAmd: true, createdAt: true },
    }),
  ]);

  for (const s of sessions) {
    if (s.openingCountAmd == null) { out.set(s.id, null); continue; }
    const upper = s.closingAt ?? new Date();
    let cash = 0;
    for (const sale of sales) {
      if (sale.sellingPointId !== s.sellingPointId) continue;
      if (sale.createdAt < s.openingAt || sale.createdAt >= upper) continue;
      // Only the part actually paid in cash entered the drawer; any portion that
      // went elsewhere (bank transfer / card, or straight to the safe) doesn't.
      cash += Number(sale.totalAmd) - Number(sale.nonDrawerAmd);
    }
    for (const r of returns) {
      // Tied to a drawer → that exact session; otherwise match by point + time.
      const matched = r.cashSessionId != null
        ? r.cashSessionId === s.id
        : (r.sellingPointId === s.sellingPointId && r.createdAt >= s.openingAt && r.createdAt < upper);
      if (matched) cash += Number(r.drawerDeltaAmd);
    }
    out.set(s.id, s.openingCountAmd + cash);
  }
  return out;
}
