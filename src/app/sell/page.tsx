import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SellFlow } from './SellFlow';
import { getT } from '@/lib/i18n-server';

export default async function SellPage() {
  const user = await requireUser();
  const { t } = await getT();
  const [sps, openShift, megamall] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
    prisma.sellingPoint.findFirst({ where: { name: 'Megamall' }, select: { id: true } }),
  ]);
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
      />
    </div>
  );
}
