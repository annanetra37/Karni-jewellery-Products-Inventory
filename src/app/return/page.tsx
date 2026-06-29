import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ReturnFlow } from './ReturnFlow';
import { getT } from '@/lib/i18n-server';

export default async function ReturnPage() {
  const user = await requireUser();
  const { t } = await getT();
  const [sps, openShift, megamall] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
    prisma.sellingPoint.findFirst({ where: { name: 'Megamall' }, select: { id: true } }),
  ]);
  const allowed = await allowedSellingPoints(user, sps);
  const allowedIds = new Set(allowed.map((s) => s.id));
  const preferred =
    (openShift?.sellingPointId && allowedIds.has(openShift.sellingPointId) ? openShift.sellingPointId : '')
    || (megamall && allowedIds.has(megamall.id) ? megamall.id : '')
    || allowed[0]?.id || '';
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('rx.title')}</h1>
      <p className="page-subtitle">{t('rx.subtitle')}</p>
      <ReturnFlow
        sellingPoints={allowed.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={preferred}
      />
    </div>
  );
}
