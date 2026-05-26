import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NewOrderForm } from './NewOrderForm';

export default async function NewOrderPage() {
  await requireUser();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">New order</h1>
      <NewOrderForm sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))} />
    </div>
  );
}
