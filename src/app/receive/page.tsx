import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ReceiveFlow } from './ReceiveFlow';

export default async function ReceivePage() {
  const user = await requireUser();
  const [sps, openShift] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
  ]);
  const recent = await prisma.stockMovement.findMany({
    where: { type: 'CHECKIN' },
    orderBy: { createdAt: 'desc' }, take: 8,
    include: { variant: true, sellingPoint: true, performedBy: true },
  });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Receive stock</h1>
      <ReceiveFlow
        sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={openShift?.sellingPointId || ''}
      />
      <section className="card">
        <p className="font-medium mb-2">Recent check-ins</p>
        <ul className="space-y-2 text-sm">
          {recent.map((m) => (
            <li key={m.id} className="flex justify-between border-b border-karni-100 pb-1">
              <div>
                <p>{m.variant.designName} <span className="text-xs text-karni-700">({m.variant.color || ''})</span></p>
                <p className="text-xs text-karni-700">{m.sellingPoint.name} · by {m.performedBy.fullName} · {m.createdAt.toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-700">+{m.qtyDelta}</p>
              </div>
            </li>
          ))}
          {recent.length === 0 && <li className="text-karni-700">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
