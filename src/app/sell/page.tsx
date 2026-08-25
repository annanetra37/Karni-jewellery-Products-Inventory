import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SellFlow } from './SellFlow';
import { getT } from '@/lib/i18n-server';

export default async function SellPage() {
  const user = await requireUser();
  const { t } = await getT();
  const [sps, openShift, megamall, activeUsers, onShift] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
    prisma.sellingPoint.findFirst({ where: { name: 'Megamall' }, select: { id: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    // Reps currently on an open shift — listed first in the "Sold by" picker.
    prisma.shiftParticipant.findMany({ where: { leftAt: null, session: { status: 'OPEN' } }, select: { userId: true } }),
  ]);
  const onShiftIds = new Set(onShift.map((p) => p.userId));
  // On-shift reps first (most likely the seller on a shared device), then the rest.
  const sellers = [...activeUsers].sort((a, b) => {
    const ao = onShiftIds.has(a.id) ? 0 : 1;
    const bo = onShiftIds.has(b.id) ? 0 : 1;
    return ao - bo || a.fullName.localeCompare(b.fullName);
  }).map((u) => ({ id: u.id, name: u.fullName, onShift: onShiftIds.has(u.id) }));
  // A scoped user can only sell at their assigned selling points.
  const allowed = await allowedSellingPoints(user, sps);
  const allowedIds = new Set(allowed.map((s) => s.id));
  const preferred =
    (openShift?.sellingPointId && allowedIds.has(openShift.sellingPointId) ? openShift.sellingPointId : '')
    || (megamall && allowedIds.has(megamall.id) ? megamall.id : '')
    || allowed[0]?.id || '';
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('s.title')}</h1>
      <SellFlow
        sellingPoints={allowed.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={preferred}
        sellers={sellers}
        currentUserId={user.id}
      />
    </div>
  );
}
