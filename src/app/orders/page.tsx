import Link from 'next/link';
import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n-server';

export default async function OrdersPage() {
  const user = await requireUser();
  const { t } = await getT();
  const orders = await prisma.order.findMany({
    where: isAdmin(user) ? {} : { createdById: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { customer: true, sellingPoint: true, createdBy: true, lineItems: { include: { variant: true } } },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('o.title')}</h1>
        <Link href="/orders/new" className="btn-primary">{t('o.new')}</Link>
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
              <ul className="mt-2 space-y-2">
                {o.lineItems.map((li) => {
                  const cost = (Number(li.metalCostAmd ?? 0) + Number(li.fillingCostAmd ?? 0) + Number(li.platingCostAmd ?? 0) + Number(li.laborCostAmd ?? 0)) * li.quantity;
                  const specs = [
                    li.metalType && `Metal: ${li.metalType}${li.metalCostAmd != null ? ` (${Number(li.metalCostAmd).toLocaleString()} ֏)` : ''}`,
                    li.fillingMaterial && `Filling: ${li.fillingMaterial}${li.fillingCostAmd != null ? ` (${Number(li.fillingCostAmd).toLocaleString()} ֏)` : ''}`,
                    li.platingType && `Plating: ${li.platingType}${li.platingCostAmd != null ? ` (${Number(li.platingCostAmd).toLocaleString()} ֏)` : ''}`,
                    li.laborCostAmd != null && `Labor: ${Number(li.laborCostAmd).toLocaleString()} ֏`,
                  ].filter(Boolean) as string[];
                  return (
                    <li key={li.id} className="text-sm border-l-2 border-karni-200 pl-2">
                      <p>{li.quantity}× {li.variant?.designName || li.description || 'Custom item'}
                        {li.variant && <span className="text-xs text-karni-700"> · {li.variant.sku}</span>}
                        {li.unitPriceAmd != null && <span className="text-xs text-karni-700"> · {Number(li.unitPriceAmd).toLocaleString()} ֏/unit</span>}
                      </p>
                      {specs.length > 0 && <p className="text-xs text-karni-700">{specs.join(' · ')}</p>}
                      {cost > 0 && <p className="text-xs text-karni-700">Line cost: {cost.toLocaleString()} ֏</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            {o.note && <p className="text-xs text-karni-700 mt-2 italic">{o.note}</p>}
          </li>
        ))}
        {orders.length === 0 && <li className="text-karni-700 text-sm text-center py-6">{t('o.noOrders')}</li>}
      </ul>
    </div>
  );
}
