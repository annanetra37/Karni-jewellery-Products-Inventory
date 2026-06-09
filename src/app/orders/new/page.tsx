import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NewOrderForm } from './NewOrderForm';

export default async function NewOrderPage() {
  const user = await requireUser();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const allowed = await allowedSellingPoints(user, sps);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">New order</h1>
      <NewOrderForm sellingPoints={allowed.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))} />
    </div>
  );
}
