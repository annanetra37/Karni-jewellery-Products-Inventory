import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Thumb } from '@/components/Thumb';
import Link from 'next/link';

export default async function AdminInventoryPage() {
  await requireAdmin();
  const lows = await prisma.inventoryItem.findMany({
    where: { variant: { status: { not: 'ARCHIVED' } } },
    include: { variant: true, sellingPoint: true, createdBy: true },
    orderBy: [{ quantity: 'asc' }],
    take: 100,
  });
  const filtered = lows.filter((i) => i.quantity <= i.variant.reorderPoint);

  const recentMovements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: 'desc' }, take: 20,
    include: { variant: true, sellingPoint: true, performedBy: true },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">Inventory</h1>
        <p className="page-subtitle">Low stock and the audit log of every movement.</p>
      </header>

      <section className="card">
        <p className="font-semibold mb-3">Low / out of stock</p>
        <ul className="space-y-2">
          {filtered.map((i) => (
            <li key={i.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={i.variant.imageUrl} alt={i.variant.designName} size={12} />
              <Link href={`/admin/products/${i.variantId}`} className="flex-1 min-w-0">
                <p className="font-medium truncate">{i.variant.designName}</p>
                <p className="text-xs text-karni-700 truncate">{[i.variant.color, i.variant.size].filter(Boolean).join(' · ')} · {i.sellingPoint.name}</p>
                {i.createdBy && <p className="text-[10px] text-karni-700 mt-0.5">First checked in by {i.createdBy.fullName} · {i.firstSeenAt.toLocaleDateString()}</p>}
              </Link>
              <span className={`chip ${i.quantity === 0 ? 'chip-danger' : 'chip-warn'}`}>{i.quantity}</span>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-karni-700 text-center py-4 text-sm">All stock above reorder point.</li>}
        </ul>
      </section>

      <section className="card">
        <p className="font-semibold mb-3">Recent movements (audit log)</p>
        <ul className="space-y-2">
          {recentMovements.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={10} />
              <div className="flex-1 min-w-0">
                <p className="text-sm"><span className="chip mr-1">{m.type}</span>{m.variant.designName} <span className="text-xs text-karni-700">({m.variant.color || ''})</span></p>
                <p className="text-xs text-karni-700">{m.sellingPoint.name} · by {m.performedBy.fullName} · {m.createdAt.toLocaleString()}</p>
              </div>
              <span className={m.qtyDelta < 0 ? 'chip chip-danger' : 'chip chip-ok'}>
                {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
