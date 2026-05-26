import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CustomersList } from './CustomersList';

export default async function CustomersPage() {
  await requireUser();
  const customers = await prisma.customer.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Customers</h1>
      <CustomersList initial={customers.map((c) => ({ id: c.id, fullName: c.fullName, phone: c.phone, email: c.email }))} />
    </div>
  );
}
