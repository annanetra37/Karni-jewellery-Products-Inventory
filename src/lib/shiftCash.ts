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
 */
export async function expectedCloseBySession(
  sessions: CashSessionWindow[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (sessions.length === 0) return out;

  const pointIds = [...new Set(sessions.map((s) => s.sellingPointId))];
  const earliest = sessions.reduce((min, s) => (s.openingAt < min ? s.openingAt : min), sessions[0].openingAt);

  const sales = await prisma.sale.findMany({
    where: {
      sellingPointId: { in: pointIds },
      paymentMethod: 'CASH',
      cashToSafe: false,
      createdAt: { gte: earliest },
    },
    select: { sellingPointId: true, totalAmd: true, transferToBankAmd: true, createdAt: true },
  });

  for (const s of sessions) {
    if (s.openingCountAmd == null) { out.set(s.id, null); continue; }
    const upper = s.closingAt ?? new Date();
    let cash = 0;
    for (const sale of sales) {
      if (sale.sellingPointId !== s.sellingPointId) continue;
      if (sale.createdAt < s.openingAt || sale.createdAt >= upper) continue;
      // Only the part actually paid in cash entered the drawer; any portion the
      // customer paid by bank transfer / card went to the bank instead.
      cash += Number(sale.totalAmd) - Number(sale.transferToBankAmd);
    }
    out.set(s.id, s.openingCountAmd + cash);
  }
  return out;
}
