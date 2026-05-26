import Link from 'next/link';
import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await prisma.order.findMany({
    where: isAdmin(user) ? {} : { createdById: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { customer: true, sellingPoint: true, createdBy: true, lineItems: { include: { variant: true } } },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orders</h1>
        <Link href="/orders/new" className="btn-primary">+ New order</Link>
      </div>
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id} className="card">
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{o.orderNumber}</p>
                <p className="text-sm text-karni-700">
                  {o.customer?.fullName || o.customerName || 'No customer'} · {o.channel}
                </p>
                {o.deadline && <p className="text-xs text-karni-700">Deadline: {o.deadline.toLocaleDateString()}</p>}
                <p className="text-xs text-karni-700">By {o.createdBy.fullName} · {o.createdAt.toLocaleString()}</p>
              </div>
              <span className="chip">{o.status}</span>
            </div>
            {o.lineItems.length > 0 && (
              <ul className="mt-2 text-sm">
                {o.lineItems.map((li) => (
                  <li key={li.id}>{li.quantity}× {li.variant.designName} <span className="text-xs text-karni-700">{li.variant.sku}</span></li>
                ))}
              </ul>
            )}
            {o.note && <p className="text-xs text-karni-700 mt-2 italic">{o.note}</p>}
          </li>
        ))}
        {orders.length === 0 && <li className="text-karni-700 text-sm text-center py-6">No orders yet.</li>}
      </ul>
    </div>
  );
}
