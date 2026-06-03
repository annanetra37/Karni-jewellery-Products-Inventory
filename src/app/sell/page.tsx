import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SellFlow } from './SellFlow';
import { getT } from '@/lib/i18n-server';

export default async function SellPage() {
  const user = await requireUser();
  const { t } = await getT();
  const [sps, openShift] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
  ]);
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('s.title')}</h1>
      <SellFlow
        sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={openShift?.sellingPointId || ''}
      />
    </div>
  );
}
