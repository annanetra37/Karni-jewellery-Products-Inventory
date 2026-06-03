import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import Link from 'next/link';
import { getT } from '@/lib/i18n-server';

async function openShiftAction(formData: FormData) {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { redirect } = await import('next/navigation');
  const u = await requireUser();
  const sellingPointId = String(formData.get('sellingPointId') || '');
  const openingCountAmd = Number(formData.get('openingCountAmd') || 0);
  if (!sellingPointId) redirect('/kacca?err=missing');
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
  const mismatch = priorClosing !== null && Math.abs(priorClosing - openingCountAmd) > 0.001;
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
      body: `Outgoing left ${priorClosing}, incoming counted ${openingCountAmd}.`,
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
  const [sps, openShift, recentSessions] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true, type: { in: ['PHYSICAL', 'CONSIGNMENT'] } }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      include: { sellingPoint: true },
    }),
    prisma.cashDrawerSession.findMany({
      where: isAdmin(user) ? {} : { userId: user.id },
      orderBy: { openingAt: 'desc' }, take: 10,
      include: { sellingPoint: true, openingBy: true, closingBy: true, user: true },
    }),
  ]);

  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('k.title')}</h1>

      {sp.err === 'alreadyOpen' && (
        <div className="card bg-amber-50 border-amber-200 text-amber-900 text-sm">
          {t('k.alreadyOpen')} <b>{sp.by}</b>. {t('k.mustClose')}
        </div>
      )}

      {openShift ? (
        <div className="card space-y-3 bg-emerald-50 border-emerald-200">
          <p className="font-medium">{t('k.shiftOpen')}</p>
          <p className="text-sm">{openShift.sellingPoint.name} · {t('k.opened')} {openShift.openingAt.toLocaleString()}</p>
          <p className="text-sm">{t('h.openingCount')}: <b>{formatAmd(Number(openShift.openingCountAmd))}</b></p>
          <form action={closeShiftAction} className="space-y-2">
            <input type="hidden" name="sessionId" value={openShift.id} />
            <label className="label">{t('k.closingCount')}</label>
            <input className="input" name="closingCountAmd" type="number" step="0.01" min="0" required />
            <button className="btn-primary w-full" type="submit">{t('k.endShift')}</button>
          </form>
        </div>
      ) : (
        <form action={openShiftAction} className="card space-y-3">
          <p className="font-medium">{t('k.startShift')}</p>
          <label className="label">{t('c.sellingPoint')}</label>
          <select name="sellingPointId" className="input" required>
            <option value="">{t('k.pickPoint')}</option>
            {sps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="label">{t('k.countDrawer')}</label>
          <input className="input" name="openingCountAmd" type="number" step="0.01" min="0" required />
          <p className="text-xs text-karni-700">{t('k.handoverHint')}</p>
          <button className="btn-primary w-full" type="submit">{t('k.startBtn')}</button>
        </form>
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
