import { requireUser, isAdmin, allowedSellingPoints, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { reconcileSessions, isMismatch, type SessionRecon } from '@/lib/reconcile';
import Link from 'next/link';
import { getT } from '@/lib/i18n-server';

function MismatchDetail({ h, t }: { h: SessionRecon; t: (k: string) => string }) {
  return (
    <details className="text-xs mt-1">
      <summary className="text-red-700 font-medium cursor-pointer select-none">{t('k.handoverMismatch')} — {t('k.whyMismatch')}</summary>
      <div className="mt-1 space-y-1" style={{ color: 'var(--ink-soft)' }}>
        <p>
          {t('k.hExpected')}: {formatAmd(h.priorClose ?? 0)} ({t('k.hPrevClose')}) − {formatAmd(h.drawerToSafeAfterClose)} ({t('k.hMovedToSafe')}) = <b>{formatAmd(h.expectedOpen ?? 0)}</b>
        </p>
        {h.nonDrawerToSafe > 0 && (
          <p>{t('k.hAfterCloseNote')} {formatAmd(h.nonDrawerToSafe)} ({t('k.hExcluded')}).</p>
        )}
        <p>{t('k.hOpenedWith')} <b>{formatAmd(h.opening)}</b> · <span className="text-red-700 font-medium">{t('k.hOffBy')} {formatAmd(h.handoverDiff ?? 0)}</span></p>
        <p className="font-medium pt-1" style={{ color: 'var(--ink)' }}>{t('k.howToFix')}:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t('k.fixTypo')}</li>
          <li>{t('k.fixDeposit')}</li>
          <li>{t('k.fixAfterSale')}</li>
        </ul>
      </div>
    </details>
  );
}

function fmtMins(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtDuration(start: Date, end: Date | null): string {
  return fmtMins(((end ?? new Date()).getTime() - start.getTime()) / 60000);
}
const hm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function openShiftAction(formData: FormData) {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { redirect } = await import('next/navigation');
  const { sellingPointScope } = await import('@/lib/auth');
  const u = await requireUser();
  const sellingPointId = String(formData.get('sellingPointId') || '');
  const openingCountAmd = Number(formData.get('openingCountAmd') || 0);
  if (!sellingPointId) redirect('/kacca?err=missing');
  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(sellingPointId)) redirect('/kacca?err=forbidden');
  const existing = await prisma.cashDrawerSession.findFirst({
    where: { sellingPointId, status: 'OPEN' },
    include: { sellingPoint: true, openingBy: true },
  });
  if (existing) {
    redirect(`/kacca?err=alreadyOpen&by=${encodeURIComponent(existing.openingBy.fullName)}`);
  }
  const { reconcileSessions, isMismatch } = await import('@/lib/reconcile');
  const now = new Date();
  // Reconcile this opening against history: expected opening = prior closing −
  // drawer cash moved to the safe after that close (auto-detected).
  const [priorSessions, depositRows, spRow] = await Promise.all([
    prisma.cashDrawerSession.findMany({
      where: { sellingPointId, status: { in: ['CLOSED', 'DISPUTED'] } },
      orderBy: { openingAt: 'asc' },
      include: { sellingPoint: { select: { name: true } } },
    }),
    prisma.safeTransaction.findMany({
      where: { type: 'DEPOSIT', sellingPointId },
      select: { id: true, sellingPointId: true, occurredAt: true, amountAmd: true, fromDrawer: true },
    }),
    prisma.sellingPoint.findUnique({ where: { id: sellingPointId }, select: { name: true } }),
  ]);
  const pointName = spRow?.name ?? '';
  const reconSessions = [
    ...priorSessions.map((s) => ({
      id: s.id, sellingPointId: s.sellingPointId, pointName: s.sellingPoint.name, status: s.status,
      openingAt: s.openingAt, openingCountAmd: s.openingCountAmd == null ? null : Number(s.openingCountAmd),
      closingAt: s.closingAt, closingCountAmd: s.closingCountAmd == null ? null : Number(s.closingCountAmd),
      expectedCloseAmd: s.expectedClosingAmd == null ? null : Number(s.expectedClosingAmd),
    })),
    // A virtual session representing the opening being recorded right now.
    { id: '__new__', sellingPointId, pointName, status: 'OPEN', openingAt: now, openingCountAmd, closingAt: null, closingCountAmd: null, expectedCloseAmd: null },
  ];
  const { byId } = reconcileSessions(
    reconSessions,
    depositRows.map((d) => ({ id: d.id, sellingPointId: d.sellingPointId, occurredAt: d.occurredAt, amountAmd: Number(d.amountAmd), fromDrawer: d.fromDrawer })),
  );
  const thisHandover = byId.get('__new__') ?? null;
  const priorClosing = thisHandover ? thisHandover.priorClose : null;
  const mismatch = thisHandover ? isMismatch(thisHandover.handoverDiff) : false;
  const session = await prisma.cashDrawerSession.create({
    data: {
      sellingPointId, userId: u.id,
      openingCountAmd, openingById: u.id, openingAt: now,
      priorClosingAmd: priorClosing ?? undefined,
      handoverMismatch: mismatch,
      status: 'OPEN',
    },
  });
  if (mismatch && thisHandover) {
    const { notify } = await import('@/lib/notify');
    await notify({
      type: 'KACCA_MISMATCH', toAdmins: true,
      title: `Kacca mismatch at ${pointName}`,
      body: `Previous closing ${thisHandover.priorClose}${thisHandover.drawerToSafeAfterClose ? `, ${thisHandover.drawerToSafeAfterClose} moved from drawer to safe` : ''}, expected ${thisHandover.expectedOpen}, but opened with ${openingCountAmd} (off by ${(thisHandover.handoverDiff ?? 0).toFixed(2)}).`,
      relatedId: session.id,
    });
  }
  redirect('/kacca');
}

async function startBreakAction(formData: FormData) {
  'use server';
  const { requireUser, sellingPointScope } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { redirect } = await import('next/navigation');
  const u = await requireUser();
  const sessionId = String(formData.get('sessionId') || '');
  const session = await prisma.cashDrawerSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'OPEN') redirect('/kacca');
  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(session!.sellingPointId)) redirect('/kacca?err=forbidden');
  // No-op if a break is already running.
  const openBreak = await prisma.shiftBreak.findFirst({ where: { sessionId, endedAt: null } });
  if (!openBreak) await prisma.shiftBreak.create({ data: { sessionId } });
  redirect('/kacca');
}

async function endBreakAction(formData: FormData) {
  'use server';
  const { requireUser, sellingPointScope } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { redirect } = await import('next/navigation');
  const u = await requireUser();
  const sessionId = String(formData.get('sessionId') || '');
  const session = await prisma.cashDrawerSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'OPEN') redirect('/kacca');
  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(session!.sellingPointId)) redirect('/kacca?err=forbidden');
  const openBreak = await prisma.shiftBreak.findFirst({ where: { sessionId, endedAt: null }, orderBy: { startedAt: 'desc' } });
  if (openBreak) await prisma.shiftBreak.update({ where: { id: openBreak.id }, data: { endedAt: new Date() } });
  redirect('/kacca');
}

async function closeShiftAction(formData: FormData) {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { redirect } = await import('next/navigation');
  const u = await requireUser();
  const sessionId = String(formData.get('sessionId') || '');
  const closingCountAmd = Number(formData.get('closingCountAmd') || 0);
  const session = await prisma.cashDrawerSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'OPEN') redirect('/kacca');
  const { sellingPointScope } = await import('@/lib/auth');
  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(session!.sellingPointId)) redirect('/kacca?err=forbidden');
  // Compute expected from cash sales between openingAt and now at this sellingPoint.
  const cashSales = await prisma.sale.aggregate({
    _sum: { totalAmd: true },
    where: {
      sellingPointId: session!.sellingPointId,
      paymentMethod: 'CASH',
      createdAt: { gte: session!.openingAt },
    },
  });
  const cashRevenue = Number(cashSales._sum.totalAmd ?? 0);
  const expected = Number(session!.openingCountAmd) + cashRevenue;
  const discrepancy = closingCountAmd - expected;
  await prisma.cashDrawerSession.update({
    where: { id: sessionId },
    data: {
      closingCountAmd,
      closingById: u.id,
      closingAt: new Date(),
      expectedClosingAmd: expected,
      discrepancyAmd: discrepancy,
      status: Math.abs(discrepancy) > 0.001 ? 'DISPUTED' : 'CLOSED',
    },
  });
  if (Math.abs(discrepancy) > 0.001) {
    const { notify } = await import('@/lib/notify');
    await notify({
      type: 'KACCA_MISMATCH', toAdmins: true,
      title: `Cash discrepancy: ${u.fullName}`,
      body: `Counted ${closingCountAmd}, expected ${expected.toFixed(2)}, diff ${discrepancy.toFixed(2)}.`,
      relatedId: sessionId,
    });
  }
  redirect('/kacca');
}

async function editOpeningCountAction(formData: FormData) {
  'use server';
  const { requireUser, isAdmin, sellingPointScope } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { redirect } = await import('next/navigation');
  const u = await requireUser();
  if (!isAdmin(u)) redirect('/kacca?err=forbidden');
  const sessionId = String(formData.get('sessionId') || '');
  const openingCountAmd = Number(formData.get('openingCountAmd') || 0);
  const found = await prisma.cashDrawerSession.findUnique({ where: { id: sessionId } });
  if (!found || found.status !== 'OPEN') redirect('/kacca');
  const session = found!;
  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(session.sellingPointId)) redirect('/kacca?err=forbidden');
  // Recompute the handover mismatch against the corrected amount using the
  // shared reconciliation (safe-aware, after-close-sale-aware).
  const { reconcileSessions, isMismatch } = await import('@/lib/reconcile');
  const [pointSessions, depositRows] = await Promise.all([
    prisma.cashDrawerSession.findMany({
      where: { sellingPointId: session.sellingPointId, status: { in: ['CLOSED', 'DISPUTED', 'OPEN'] } },
      orderBy: { openingAt: 'asc' },
      include: { sellingPoint: { select: { name: true } } },
    }),
    prisma.safeTransaction.findMany({
      where: { type: 'DEPOSIT', sellingPointId: session.sellingPointId },
      select: { id: true, sellingPointId: true, occurredAt: true, amountAmd: true, fromDrawer: true },
    }),
  ]);
  const { byId } = reconcileSessions(
    pointSessions.map((s) => ({
      id: s.id, sellingPointId: s.sellingPointId, pointName: s.sellingPoint.name, status: s.status,
      openingAt: s.openingAt,
      // Use the corrected amount for the session being edited.
      openingCountAmd: s.id === sessionId ? openingCountAmd : (s.openingCountAmd == null ? null : Number(s.openingCountAmd)),
      closingAt: s.closingAt, closingCountAmd: s.closingCountAmd == null ? null : Number(s.closingCountAmd),
      expectedCloseAmd: s.expectedClosingAmd == null ? null : Number(s.expectedClosingAmd),
    })),
    depositRows.map((d) => ({ id: d.id, sellingPointId: d.sellingPointId, occurredAt: d.occurredAt, amountAmd: Number(d.amountAmd), fromDrawer: d.fromDrawer })),
  );
  const thisHandover = byId.get(sessionId) ?? null;
  const mismatch = thisHandover ? isMismatch(thisHandover.handoverDiff) : false;
  await prisma.cashDrawerSession.update({
    where: { id: sessionId },
    data: { openingCountAmd, handoverMismatch: mismatch },
  });
  redirect('/kacca');
}

export default async function KaccaPage({ searchParams }: { searchParams: Promise<{ err?: string; by?: string }> }) {
  const user = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const scope = await sellingPointScope(user);
  // The open shift is found by SELLING POINT (the cassa is shared), so whoever
  // is on shift — the person leaving or the one arriving — can close it during
  // a handover. Unrestricted users fall back to their own open shift.
  const openWhere = scope
    ? { status: 'OPEN' as const, sellingPointId: { in: scope } }
    : { status: 'OPEN' as const, userId: user.id };
  const recentWhere = scope ? { sellingPointId: { in: scope } } : (isAdmin(user) ? {} : { userId: user.id });
  // Admins (and super admins) get a live overview of every shift currently open
  // across the points they oversee — which point, opened by whom, and when.
  const openShiftsWhere = scope
    ? { status: 'OPEN' as const, sellingPointId: { in: scope } }
    : { status: 'OPEN' as const };
  const [sps, openShift, recentSessions, openShifts] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true, type: { in: ['PHYSICAL', 'CONSIGNMENT'] } }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({
      where: openWhere,
      orderBy: { openingAt: 'asc' },
      include: { sellingPoint: true, openingBy: true, breaks: { orderBy: { startedAt: 'desc' } } },
    }),
    prisma.cashDrawerSession.findMany({
      where: recentWhere,
      orderBy: { openingAt: 'desc' }, take: 10,
      include: { sellingPoint: true, openingBy: true, closingBy: true, user: true, breaks: { orderBy: { startedAt: 'asc' } } },
    }),
    isAdmin(user)
      ? prisma.cashDrawerSession.findMany({
          where: openShiftsWhere,
          orderBy: { openingAt: 'asc' },
          include: { sellingPoint: true, openingBy: true, breaks: { orderBy: { startedAt: 'asc' } } },
        })
      : Promise.resolve([]),
  ]);
  const allowedSps = await allowedSellingPoints(user, sps);
  const admin = isAdmin(user); // only admins see drawer reconciliation history

  // Live handover reconciliation so we can explain any mismatch (and how to
  // fix it) on each session. Admin-only — sales reps don't see reconciliation.
  const reconPointIds = admin ? [...new Set([
    ...(openShift ? [openShift.sellingPointId] : []),
    ...recentSessions.map((s) => s.sellingPointId),
    ...openShifts.map((s) => s.sellingPointId),
  ])] : [];
  let reconById = new Map<string, SessionRecon>();
  if (reconPointIds.length > 0) {
    const [reconSessions, depositRows] = await Promise.all([
      prisma.cashDrawerSession.findMany({
        where: { sellingPointId: { in: reconPointIds }, status: { in: ['CLOSED', 'DISPUTED', 'OPEN'] } },
        orderBy: { openingAt: 'asc' },
        include: { sellingPoint: { select: { name: true } } },
      }),
      prisma.safeTransaction.findMany({
        where: { type: 'DEPOSIT', sellingPointId: { in: reconPointIds } },
        select: { id: true, sellingPointId: true, occurredAt: true, amountAmd: true, fromDrawer: true },
      }),
    ]);
    reconById = reconcileSessions(
      reconSessions.map((s) => ({
        id: s.id, sellingPointId: s.sellingPointId, pointName: s.sellingPoint.name, status: s.status,
        openingAt: s.openingAt, openingCountAmd: s.openingCountAmd == null ? null : Number(s.openingCountAmd),
        closingAt: s.closingAt, closingCountAmd: s.closingCountAmd == null ? null : Number(s.closingCountAmd),
        expectedCloseAmd: s.expectedClosingAmd == null ? null : Number(s.expectedClosingAmd),
      })),
      depositRows.map((d) => ({ id: d.id, sellingPointId: d.sellingPointId, occurredAt: d.occurredAt, amountAmd: Number(d.amountAmd), fromDrawer: d.fromDrawer })),
    ).byId;
  }
  const handoverFor = (s: { id: string }) => {
    const r = reconById.get(s.id);
    return r && isMismatch(r.handoverDiff) ? r : null;
  };

  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('k.title')}</h1>

      {sp.err === 'alreadyOpen' && (
        <div className="card bg-amber-50 border-amber-200 text-amber-900 text-sm">
          {t('k.alreadyOpen')} <b>{sp.by}</b>. {t('k.mustClose')}
        </div>
      )}
      {sp.err === 'forbidden' && (
        <div className="card bg-red-50 border-red-200 text-red-900 text-sm">
          {t('k.forbidden')}
        </div>
      )}

      {openShift ? (() => {
        const activeBreak = openShift.breaks.find((b) => b.endedAt == null) ?? null;
        const onHold = !!activeBreak;
        return (
        <div className={`card space-y-3 ${onHold ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="font-medium">
            {t('k.shiftOpen')}
            {onHold && <span className="chip chip-warn ml-2">{t('k.onHold')}</span>}
          </p>
          <p className="text-sm">{openShift.sellingPoint.name} · {t('k.opened')} {openShift.openingAt.toLocaleString()}</p>
          <p className="text-sm">{t('h.openingCount')}: <b>{formatAmd(Number(openShift.openingCountAmd))}</b> · {t('o.by').toLowerCase()} {openShift.openingBy.fullName}</p>

          {/* Break controls */}
          {onHold ? (
            <div className="rounded-xl p-3 bg-amber-100/60 border border-amber-200 space-y-2">
              <p className="text-sm font-medium text-amber-900">{t('k.onBreakSince')} {activeBreak!.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <form action={endBreakAction}>
                <input type="hidden" name="sessionId" value={openShift.id} />
                <button className="btn-primary w-full" type="submit">{t('k.endBreak')}</button>
              </form>
            </div>
          ) : (
            <form action={startBreakAction}>
              <input type="hidden" name="sessionId" value={openShift.id} />
              <button className="btn-secondary w-full" type="submit">{t('k.startBreak')}</button>
            </form>
          )}

          {openShift.breaks.length > 0 && (
            <ul className="text-xs space-y-0.5" style={{ color: 'var(--ink-soft)' }}>
              {openShift.breaks.map((b) => (
                <li key={b.id}>
                  {t('k.break')}: {b.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {b.endedAt ? b.endedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…'}
                </li>
              ))}
            </ul>
          )}

          <form action={closeShiftAction} className="space-y-2 pt-1 border-t border-emerald-200">
            <input type="hidden" name="sessionId" value={openShift.id} />
            <label className="label">{t('k.closingCount')}</label>
            <input className="input" name="closingCountAmd" type="number" step="0.01" min="0" required />
            <p className="text-xs text-karni-700">{t('k.closeHint')}</p>
            <button className="btn-primary w-full" type="submit" disabled={onHold}>{t('k.endShift')}</button>
            {onHold && <p className="text-xs text-amber-800">{t('k.endBreakFirst')}</p>}
          </form>
        </div>
        );
      })() : (
        <form action={openShiftAction} className="card space-y-3">
          <p className="font-medium">{t('k.startShift')}</p>
          <label className="label">{t('c.sellingPoint')}</label>
          <select name="sellingPointId" className="input" required>
            <option value="">{t('k.pickPoint')}</option>
            {allowedSps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="label">{t('k.countDrawer')}</label>
          <input className="input" name="openingCountAmd" type="number" step="0.01" min="0" required />
          <p className="text-xs text-karni-700">{t('k.handoverHint')}</p>
          <button className="btn-primary w-full" type="submit">{t('k.startBtn')}</button>
        </form>
      )}

      {isAdmin(user) && (
        <section className="card">
          <p className="font-medium mb-2">{t('k.openShifts')}</p>
          {openShifts.length === 0 ? (
            <p className="text-sm text-karni-700">{t('k.noOpenShifts')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {openShifts.map((s) => {
                const onHold = s.breaks.some((b) => b.endedAt == null);
                const totalBreakMins = s.breaks.reduce((m, b) => m + Math.round(((b.endedAt ?? new Date()).getTime() - b.startedAt.getTime()) / 60000), 0);
                return (
                <li key={s.id} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${onHold ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="font-medium">{s.sellingPoint.name}</span>
                        <span className="text-karni-700"> · {t('k.openedBy')} {s.openingBy.fullName}</span>
                        {onHold && <span className="chip chip-warn ml-2">{t('k.onHold')}</span>}
                      </span>
                    </span>
                    <span className="text-xs text-karni-700 text-right shrink-0">
                      {t('k.at')} {s.openingAt.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1 pl-4">
                    <span className="text-xs text-karni-700">{t('h.openingCount')}: <b>{formatAmd(Number(s.openingCountAmd))}</b></span>
                    <details className="text-xs">
                      <summary className="btn-link cursor-pointer select-none">{t('k.editOpening')}</summary>
                      <form action={editOpeningCountAction} className="flex items-center gap-2 mt-2">
                        <input type="hidden" name="sessionId" value={s.id} />
                        <input className="input py-1.5 w-32" name="openingCountAmd" type="number" step="0.01" min="0"
                          defaultValue={Number(s.openingCountAmd)} required />
                        <button className="btn-primary px-3 py-1.5" type="submit">{t('c.save')}</button>
                      </form>
                    </details>
                  </div>
                  {handoverFor(s) && <div className="mt-1 pl-4"><MismatchDetail h={handoverFor(s)!} t={t} /></div>}
                  {/* Break detail */}
                  <div className="mt-1 pl-4 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    {s.breaks.length === 0 ? (
                      <span>{t('k.breaks')}: {t('k.noBreaks')}</span>
                    ) : (
                      <>
                        <span className="font-medium">{t('k.breaks')} ({s.breaks.length}) · {t('k.total')} {fmtMins(totalBreakMins)}:</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {s.breaks.map((b) => (
                            <li key={b.id}>
                              {hm(b.startedAt)} – {b.endedAt ? hm(b.endedAt) : t('k.ongoing')} ({fmtDuration(b.startedAt, b.endedAt)})
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {admin && (
      <section className="card">
        <p className="font-medium mb-2">{t('k.recentSessions')}</p>
        <ul className="space-y-2 text-sm">
          {recentSessions.map((s) => (
            <li key={s.id} className="border-b border-karni-100 pb-2">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{s.sellingPoint.name} · {s.user.fullName}</p>
                  <p className="text-xs text-karni-700">
                    Opened {s.openingAt.toLocaleString()} · {s.status}
                  </p>
                  {s.breaks.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {t('k.breaks')} ({s.breaks.length}): {s.breaks.map((b) => `${hm(b.startedAt)}–${b.endedAt ? hm(b.endedAt) : t('k.ongoing')}`).join(', ')} · {t('k.total')} {fmtMins(s.breaks.reduce((m, b) => m + ((b.endedAt ?? new Date()).getTime() - b.startedAt.getTime()) / 60000, 0))}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs">
                  <p>Opened: {formatAmd(Number(s.openingCountAmd))}</p>
                  {s.closingCountAmd != null && <p>Closed: {formatAmd(Number(s.closingCountAmd))}</p>}
                  {s.discrepancyAmd != null && Math.abs(Number(s.discrepancyAmd)) > 0.001 && (
                    <p className="text-red-700">Diff: {formatAmd(Number(s.discrepancyAmd))}</p>
                  )}
                  {handoverFor(s) && <div className="text-left"><MismatchDetail h={handoverFor(s)!} t={t} /></div>}
                </div>
              </div>
            </li>
          ))}
          {recentSessions.length === 0 && <li className="text-karni-700">None yet.</li>}
        </ul>
      </section>
      )}
      {admin && <Link href="/admin/reports" className="btn-ghost w-full">{t('k.allReports')}</Link>}
    </div>
  );
}
