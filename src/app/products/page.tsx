import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ProductSearch } from '@/components/ProductSearch';

export default async function ProductsPage() {
  const user = await requireUser();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const allowed = await allowedSellingPoints(user, sps);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Catalog</h1>
      <ProductSearch sellingPoints={allowed} autoFocus />
    </div>
  );
}
