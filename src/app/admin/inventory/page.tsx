import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export default async function AdminInventoryPage() {
  await requireAdmin();
  const lows = await prisma.inventoryItem.findMany({
    where: { variant: { status: { not: 'ARCHIVED' } } },
    include: { variant: true, sellingPoint: true },
    orderBy: [{ quantity: 'asc' }],
    take: 100,
  });
  const filtered = lows.filter((i) => i.quantity <= i.variant.reorderPoint);

  const recentMovements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: 'desc' }, take: 20,
    include: { variant: true, sellingPoint: true, performedBy: true },
  });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Inventory</h1>
      <section className="card">
        <p className="font-medium mb-2">Low / out of stock</p>
        <ul className="space-y-1 text-sm">
          {filtered.map((i) => (
            <li key={i.id} className="flex justify-between border-b border-karni-100 pb-1">
              <Link href={`/admin/products/${i.variantId}`} className="text-karni-700 hover:underline">
                {i.variant.designName} <span className="text-xs">({i.variant.color || ''})</span> · {i.sellingPoint.name}
              </Link>
              <span className={i.quantity === 0 ? 'text-red-700 font-bold' : 'text-amber-800'}>{i.quantity}</span>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-karni-700 text-center py-4">All stock above reorder point.</li>}
        </ul>
      </section>

      <section className="card">
        <p className="font-medium mb-2">Recent movements (audit log)</p>
        <ul className="space-y-1 text-sm">
          {recentMovements.map((m) => (
            <li key={m.id} className="flex justify-between border-b border-karni-100 pb-1">
              <div>
                <p>{m.type} · {m.variant.designName} <span className="text-xs">({m.variant.color || ''})</span></p>
                <p className="text-xs text-karni-700">{m.sellingPoint.name} · by {m.performedBy.fullName} · {m.createdAt.toLocaleString()}</p>
              </div>
              <span className={m.qtyDelta < 0 ? 'text-red-700' : 'text-emerald-700'}>
                {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
