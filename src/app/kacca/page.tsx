import { requireUser, isAdmin, allowedSellingPoints, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import Link from 'next/link';
import { getT } from '@/lib/i18n-server';

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
  // Find the most recent closed session at this point to compare.
  const prior = await prisma.cashDrawerSession.findFirst({
    where: { sellingPointId, status: { in: ['CLOSED', 'DISPUTED'] } },
    orderBy: { closingAt: 'desc' },
  });
  const priorClosing = prior?.closingCountAmd ? Number(prior.closingCountAmd) : null;
  // Cash legitimately moved to the safe since the last close is expected to be
  // missing from the drawer, so subtract it before flagging a discrepancy.
  let safeMoved = 0;
  if (priorClosing !== null && prior?.closingAt) {
    // Count safe deposits from this drawer since the closing DAY, so a deposit
    // dated to that day (any time) is captured even if it was stamped before
    // the precise closing time.
    const cd = prior.closingAt;
    const dayStart = new Date(Date.UTC(cd.getUTCFullYear(), cd.getUTCMonth(), cd.getUTCDate()));
    const agg = await prisma.safeTransaction.aggregate({
      _sum: { amountAmd: true },
      where: { type: 'DEPOSIT', sellingPointId, occurredAt: { gte: dayStart } },
    });
    safeMoved = Number(agg._sum.amountAmd ?? 0);
  }
  const expectedOpening = priorClosing === null ? null : priorClosing - safeMoved;
  const mismatch = expectedOpening !== null && Math.abs(expectedOpening - openingCountAmd) > 0.001;
  const session = await prisma.cashDrawerSession.create({
    data: {
      sellingPointId, userId: u.id,
      openingCountAmd, openingById: u.id,
      priorClosingAmd: priorClosing ?? undefined,
      handoverMismatch: mismatch,
      status: 'OPEN',
    },
  });
  if (mismatch) {
    const { notify } = await import('@/lib/notify');
    const sp = await prisma.sellingPoint.findUnique({ where: { id: sellingPointId } });
    await notify({
      type: 'KACCA_MISMATCH', toAdmins: true,
      title: `Kacca mismatch at ${sp?.name}`,
      body: `Previous closing ${priorClosing}${safeMoved ? `, ${safeMoved} moved to safe` : ''}, expected ${expectedOpening}, but opened with ${openingCountAmd} (off by ${(openingCountAmd - (expectedOpening ?? 0)).toFixed(2)}).`,
      relatedId: session.id,
    });
  }
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
      include: { sellingPoint: true, openingBy: true },
    }),
    prisma.cashDrawerSession.findMany({
      where: recentWhere,
      orderBy: { openingAt: 'desc' }, take: 10,
      include: { sellingPoint: true, openingBy: true, closingBy: true, user: true },
    }),
    isAdmin(user)
      ? prisma.cashDrawerSession.findMany({
          where: openShiftsWhere,
          orderBy: { openingAt: 'asc' },
          include: { sellingPoint: true, openingBy: true },
        })
      : Promise.resolve([]),
  ]);
  const allowedSps = await allowedSellingPoints(user, sps);

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

      {openShift ? (
        <div className="card space-y-3 bg-emerald-50 border-emerald-200">
          <p className="font-medium">{t('k.shiftOpen')}</p>
          <p className="text-sm">{openShift.sellingPoint.name} · {t('k.opened')} {openShift.openingAt.toLocaleString()}</p>
          <p className="text-sm">{t('h.openingCount')}: <b>{formatAmd(Number(openShift.openingCountAmd))}</b> · {t('o.by').toLowerCase()} {openShift.openingBy.fullName}</p>
          <form action={closeShiftAction} className="space-y-2">
            <input type="hidden" name="sessionId" value={openShift.id} />
            <label className="label">{t('k.closingCount')}</label>
            <input className="input" name="closingCountAmd" type="number" step="0.01" min="0" required />
            <p className="text-xs text-karni-700">{t('k.closeHint')}</p>
            <button className="btn-primary w-full" type="submit">{t('k.endShift')}</button>
          </form>
        </div>
      ) : (
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
              {openShifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="font-medium">{s.sellingPoint.name}</span>
                      <span className="text-karni-700"> · {t('k.openedBy')} {s.openingBy.fullName}</span>
                    </span>
                  </span>
                  <span className="text-xs text-karni-700 text-right shrink-0">
                    {t('k.at')} {s.openingAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
                </div>
                <div className="text-right text-xs">
                  <p>Opened: {formatAmd(Number(s.openingCountAmd))}</p>
                  {s.closingCountAmd != null && <p>Closed: {formatAmd(Number(s.closingCountAmd))}</p>}
                  {s.discrepancyAmd != null && Math.abs(Number(s.discrepancyAmd)) > 0.001 && (
                    <p className="text-red-700">Diff: {formatAmd(Number(s.discrepancyAmd))}</p>
                  )}
                  {s.handoverMismatch && <p className="text-red-700">Handover mismatch</p>}
                </div>
              </div>
            </li>
          ))}
          {recentSessions.length === 0 && <li className="text-karni-700">None yet.</li>}
        </ul>
      </section>
      {isAdmin(user) && <Link href="/admin/reports" className="btn-ghost w-full">{t('k.allReports')}</Link>}
    </div>
  );
}
