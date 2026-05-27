import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ReceiveFlow } from './ReceiveFlow';
import { Thumb } from '@/components/Thumb';

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
    <div className="space-y-4">
      <header>
        <h1 className="page-title">Receive stock</h1>
        <p className="page-subtitle">Add newly arrived items to a selling point's inventory.</p>
      </header>
      <ReceiveFlow
        sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={openShift?.sellingPointId || ''}
      />
      <section className="card">
        <p className="font-semibold mb-3">Recent check-ins</p>
        <ul className="space-y-2">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={12} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.variant.designName} <span className="text-xs text-karni-700">({m.variant.color || ''})</span></p>
                <p className="text-xs text-karni-700 truncate">{m.sellingPoint.name} · by {m.performedBy.fullName} · {m.createdAt.toLocaleDateString()}</p>
              </div>
              <span className="chip chip-ok">+{m.qtyDelta}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-karni-700 text-sm text-center py-4">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
