import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import Link from 'next/link';

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
      <h1 className="text-xl font-bold">Kacca — cash drawer</h1>

      {sp.err === 'alreadyOpen' && (
        <div className="card bg-amber-50 border-amber-200 text-amber-900 text-sm">
          A shift is already open at this selling point by <b>{sp.by}</b>. They must close it first.
        </div>
      )}

      {openShift ? (
        <div className="card space-y-3 bg-emerald-50 border-emerald-200">
          <p className="font-medium">Your shift is open</p>
          <p className="text-sm">{openShift.sellingPoint.name} · opened {openShift.openingAt.toLocaleString()}</p>
          <p className="text-sm">Opening count: <b>{formatAmd(Number(openShift.openingCountAmd))}</b></p>
          <form action={closeShiftAction} className="space-y-2">
            <input type="hidden" name="sessionId" value={openShift.id} />
            <label className="label">Closing count (count the drawer)</label>
            <input className="input" name="closingCountAmd" type="number" step="0.01" min="0" required />
            <button className="btn-primary w-full" type="submit">End shift & hand over</button>
          </form>
        </div>
      ) : (
        <form action={openShiftAction} className="card space-y-3">
          <p className="font-medium">Start a shift</p>
          <label className="label">Selling point</label>
          <select name="sellingPointId" className="input" required>
            <option value="">Pick one…</option>
            {sps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="label">Opening count (count the drawer)</label>
          <input className="input" name="openingCountAmd" type="number" step="0.01" min="0" required />
          <p className="text-xs text-karni-700">If your count differs from what the previous person left, both numbers are saved and admin is notified.</p>
          <button className="btn-primary w-full" type="submit">Start shift</button>
        </form>
      )}

      <section className="card">
        <p className="font-medium mb-2">Recent sessions</p>
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
      {isAdmin(user) && <Link href="/admin/reports" className="btn-ghost w-full">All session reports →</Link>}
    </div>
  );
}
