import { yerevanDayStart } from './datetime';

export type ReconSession = {
  sellingPointId: string;
  pointName: string;
  status: string;
  openingAt: Date;
  openingCountAmd: number | null;
  closingAt: Date | null;
  closingCountAmd: number | null;
};
export type ReconDeposit = { id: string; sellingPointId: string | null; occurredAt: Date; amountAmd: number };
export type ReconCashSale = { sellingPointId: string; createdAt: Date; totalAmd: number };

export type Handover = {
  point: string;
  sellingPointId: string;
  closing: number;
  deposited: number;          // total moved to the safe in the gap
  afterCloseCashSales: number; // cash sales rung up AFTER the close (never in the drawer)
  drawerToSafe: number;        // safe deposits that actually came from the drawer
  opening: number;
  expected: number;
  diff: number;                // opening − expected
  closedAt: Date;
  openedAt: Date;
};

const TOL = 0.01;

/**
 * Reconcile each drawer handover at a selling point:
 *
 *   expected next opening = previous closing − drawer cash moved to the safe
 *
 * Crucially, a safe deposit is only "drawer cash" to the extent it exceeds the
 * cash sales that were rung up AFTER the close — those sales never entered the
 * drawer, so moving their cash to the safe must NOT reduce the expected opening.
 * Each deposit is matched to exactly one handover (processed chronologically).
 */
export function reconcileHandovers(
  sessions: ReconSession[],
  deposits: ReconDeposit[],
  cashSales: ReconCashSale[],
): { handovers: Handover[]; matchedDepositIds: Set<string> } {
  const byPoint = new Map<string, ReconSession[]>();
  for (const s of sessions) {
    const arr = byPoint.get(s.sellingPointId) || [];
    arr.push(s);
    byPoint.set(s.sellingPointId, arr);
  }
  const matched = new Set<string>();
  const out: Handover[] = [];
  for (const arr of byPoint.values()) {
    arr.sort((a, b) => a.openingAt.getTime() - b.openingAt.getTime());
    for (let i = 0; i < arr.length - 1; i++) {
      const prev = arr[i], next = arr[i + 1];
      if (prev.status === 'OPEN' || prev.closingCountAmd == null || !prev.closingAt) continue;
      const lower = yerevanDayStart(prev.closingAt);
      const inGap = deposits.filter((d) =>
        !matched.has(d.id) && d.sellingPointId === prev.sellingPointId &&
        d.occurredAt >= lower && d.occurredAt < next.openingAt);
      inGap.forEach((d) => matched.add(d.id));
      const deposited = inGap.reduce((s, d) => s + d.amountAmd, 0);
      const afterCloseCashSales = cashSales
        .filter((c) => c.sellingPointId === prev.sellingPointId && c.createdAt > prev.closingAt! && c.createdAt < next.openingAt)
        .reduce((s, c) => s + c.totalAmd, 0);
      const drawerToSafe = Math.max(0, deposited - afterCloseCashSales);
      const closing = Number(prev.closingCountAmd);
      const opening = Number(next.openingCountAmd ?? 0);
      const expected = closing - drawerToSafe;
      out.push({
        point: prev.pointName, sellingPointId: prev.sellingPointId,
        closing, deposited, afterCloseCashSales, drawerToSafe,
        opening, expected, diff: opening - expected,
        closedAt: prev.closingAt, openedAt: next.openingAt,
      });
    }
  }
  return { handovers: out, matchedDepositIds: matched };
}

export function isHandoverMismatch(h: Handover): boolean {
  return Math.abs(h.diff) > TOL;
}
