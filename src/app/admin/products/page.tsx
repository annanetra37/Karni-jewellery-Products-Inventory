import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ProductSearch } from '@/components/ProductSearch';

export default async function AdminProductsPage() {
  await requireAdmin();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <header>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">Browse, filter, edit. Tap any card to manage it.</p>
        </header>
        <Link href="/admin/products/new" className="btn-primary">+ New product</Link>
      </div>
      <ProductSearch
        sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        linkBase="/admin/products"
        autoFocus
      />
    </div>
  );
}
