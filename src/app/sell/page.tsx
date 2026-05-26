import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SellFlow } from './SellFlow';

export default async function SellPage() {
  const user = await requireUser();
  const [sps, openShift] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
  ]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Sell</h1>
      <SellFlow
        sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={openShift?.sellingPointId || ''}
      />
    </div>
  );
}
