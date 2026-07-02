import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CustomersList } from './CustomersList';
import { getT } from '@/lib/i18n-server';

export default async function CustomersPage() {
  await requireUser();
  const { t } = await getT();
  const PAGE_SIZE = 20;
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ orderBy: { createdAt: 'desc' }, take: PAGE_SIZE }),
    prisma.customer.count(),
  ]);
  return (
    <div className="space-y-3">
      <h1 className="page-title">{t('cu.title')}</h1>
      <CustomersList total={total} initial={customers.map((c) => ({
        id: c.id, fullName: c.fullName, phone: c.phone, email: c.email,
        birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
        address: c.address, instagram: c.instagram, gender: c.gender, profession: c.profession, notes: c.notes,
        createdAt: c.createdAt.toISOString(),
      }))} />
    </div>
  );
}
