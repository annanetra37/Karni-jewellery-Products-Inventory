import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CustomersList } from './CustomersList';
import { getT } from '@/lib/i18n-server';

export default async function CustomersPage() {
  await requireUser();
  const { t } = await getT();
  const customers = await prisma.customer.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('cu.title')}</h1>
      <CustomersList initial={customers.map((c) => ({
        id: c.id, fullName: c.fullName, phone: c.phone, email: c.email,
        birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
        address: c.address, instagram: c.instagram, gender: c.gender, notes: c.notes,
        createdAt: c.createdAt.toISOString(),
      }))} />
    </div>
  );
}
