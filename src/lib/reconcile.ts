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
export type ReconDeposit = {
  id: string;
  sellingPointId: string | null;
  occurredAt: Date;
  amountAmd: number;
  fromDrawer: boolean; // true = drawer cash (reduces next opening); false = e.g. after-hours sale cash
};

export type Handover = {
  point: string;
  sellingPointId: string;
  closing: number;
  deposited: number;        // total moved to the safe in the gap
  drawerToSafe: number;     // deposits flagged as drawer cash (reduce expected opening)
  nonDrawerToSafe: number;  // deposits flagged as NOT from the drawer (e.g. after-hours sales)
  opening: number;
  expected: number;
  diff: number;             // opening − expected
  closedAt: Date;
  openedAt: Date;
};

const TOL = 0.01;

/**
 * Reconcile each drawer handover at a selling point:
 *
 *   expected next opening = previous closing − drawer cash moved to the safe
 *
 * Only deposits explicitly flagged as coming FROM THE DRAWER reduce the
 * expected opening. Cash from after-hours sales put straight into the safe
 * (fromDrawer = false) never entered the drawer, so it's ignored here. Each
 * deposit is matched to exactly one handover (processed chronologically).
 */
export function reconcileHandovers(
  sessions: ReconSession[],
  deposits: ReconDeposit[],
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
      const drawerToSafe = inGap.filter((d) => d.fromDrawer).reduce((s, d) => s + d.amountAmd, 0);
      const nonDrawerToSafe = deposited - drawerToSafe;
      const closing = Number(prev.closingCountAmd);
      const opening = Number(next.openingCountAmd ?? 0);
      const expected = closing - drawerToSafe;
      out.push({
        point: prev.pointName, sellingPointId: prev.sellingPointId,
        closing, deposited, drawerToSafe, nonDrawerToSafe,
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
