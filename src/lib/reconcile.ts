import { yerevanDayStart } from './datetime';

export type ReconSession = {
  id: string;
  sellingPointId: string;
  pointName: string;
  status: string;
  openingAt: Date;
  openingCountAmd: number | null;
  closingAt: Date | null;
  closingCountAmd: number | null;
  expectedCloseAmd: number | null; // opening + cash sales during the shift (stored at close)
};
export type ReconDeposit = {
  id: string;
  sellingPointId: string | null;
  occurredAt: Date;
  amountAmd: number;
  fromDrawer: boolean; // true = drawer cash; false = e.g. after-hours sale cash (ignored here)
};

export type SessionRecon = {
  id: string;
  point: string;
  sellingPointId: string;
  opening: number;
  closing: number | null;
  cashSales: number | null;
  // Close side (drawer vs sales, accounting for cash taken to the safe mid-shift)
  fromDrawerDuringShift: number;
  expectedClose: number | null;
  closeDiff: number | null;
  // Handover side (this opening vs the previous shift's close)
  priorClose: number | null;
  priorClosedAt: Date | null;
  drawerToSafeAfterClose: number;
  nonDrawerToSafe: number;
  expectedOpen: number | null;
  handoverDiff: number | null;
  openedAt: Date;
  closedAt: Date | null;
};

const TOL = 0.01;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const FAR = new Date(8.64e15);

/**
 * Reconcile cash sessions with safe deposits, per session.
 *
 * A drawer→safe transfer is applied where it fits the counts ("auto-detect"):
 *  - If the shift's closing count is short of (opening + cash sales) by up to the
 *    transferred amount, that part reduced the CLOSE (cash was moved out before
 *    counting) → it lowers the expected close.
 *  - Whatever is left reduced the NEXT OPENING (cash was moved after counting)
 *    → it lowers the next shift's expected opening.
 * Deposits flagged "not from the drawer" (after-hours sale cash) are ignored.
 */
export function reconcileSessions(
  sessions: ReconSession[],
  deposits: ReconDeposit[],
): { byId: Map<string, SessionRecon>; matchedDepositIds: Set<string> } {
  const byId = new Map<string, SessionRecon>();
  for (const s of sessions) {
    const opening = Number(s.openingCountAmd ?? 0);
    const closing = s.closingCountAmd == null ? null : Number(s.closingCountAmd);
    const E = s.expectedCloseAmd == null ? null : Number(s.expectedCloseAmd);
    byId.set(s.id, {
      id: s.id, point: s.pointName, sellingPointId: s.sellingPointId,
      opening, closing, cashSales: E != null ? E - opening : null,
      fromDrawerDuringShift: 0, expectedClose: E, closeDiff: (closing != null && E != null) ? closing - E : null,
      priorClose: null, priorClosedAt: null, drawerToSafeAfterClose: 0, nonDrawerToSafe: 0, expectedOpen: null, handoverDiff: null,
      openedAt: s.openingAt, closedAt: s.closingAt,
    });
  }

  const byPoint = new Map<string, ReconSession[]>();
  for (const s of sessions) {
    const arr = byPoint.get(s.sellingPointId) || [];
    arr.push(s); byPoint.set(s.sellingPointId, arr);
  }
  const matched = new Set<string>();
  for (const arr of byPoint.values()) {
    arr.sort((a, b) => a.openingAt.getTime() - b.openingAt.getTime());
    for (let i = 0; i < arr.length; i++) {
      const S = arr[i];
      if (S.status === 'OPEN' || S.closingCountAmd == null || !S.closingAt) continue;
      const next = arr[i + 1];
      const upper = next ? next.openingAt : FAR;
      const lower = yerevanDayStart(S.closingAt);
      const gap = deposits.filter((d) =>
        !matched.has(d.id) && d.sellingPointId === S.sellingPointId &&
        d.occurredAt >= lower && d.occurredAt < upper);
      gap.forEach((d) => matched.add(d.id));
      const drawerTotal = gap.filter((d) => d.fromDrawer).reduce((a, d) => a + d.amountAmd, 0);
      const nonDrawer = gap.filter((d) => !d.fromDrawer).reduce((a, d) => a + d.amountAmd, 0);

      const sr = byId.get(S.id)!;
      const E = sr.expectedClose;       // stored expected close (opening + cash sales)
      const CC = sr.closing;
      const rawCloseDiff = (E != null && CC != null) ? CC - E : null;
      // The transfer explains a short close up to its amount.
      const closeAttributed = rawCloseDiff != null ? clamp(-rawCloseDiff, 0, drawerTotal) : 0;
      const remaining = drawerTotal - closeAttributed;

      sr.fromDrawerDuringShift = closeAttributed;
      sr.expectedClose = E != null ? E - closeAttributed : null;
      sr.closeDiff = (CC != null && sr.expectedClose != null) ? CC - sr.expectedClose : null;

      if (next) {
        const nr = byId.get(next.id)!;
        nr.priorClose = CC;
        nr.priorClosedAt = S.closingAt;
        nr.drawerToSafeAfterClose = remaining;
        nr.nonDrawerToSafe = nonDrawer;
        nr.expectedOpen = CC != null ? CC - remaining : null;
        nr.handoverDiff = (next.openingCountAmd != null && nr.expectedOpen != null)
          ? Number(next.openingCountAmd) - nr.expectedOpen : null;
      }
    }
  }
  return { byId, matchedDepositIds: matched };
}

export function isMismatch(diff: number | null | undefined): boolean {
  return diff != null && Math.abs(diff) > TOL;
}
