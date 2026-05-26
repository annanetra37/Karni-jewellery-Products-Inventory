import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = '' } = await searchParams;
  const where = q
    ? { OR: [
        { sku: { contains: q, mode: 'insensitive' as const } },
        { designName: { contains: q, mode: 'insensitive' as const } },
        { color: { contains: q, mode: 'insensitive' as const } },
      ] }
    : {};
  const variants = await prisma.variant.findMany({
    where, take: 50, orderBy: { designName: 'asc' },
  });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Products</h1>
      <form className="card" action="/admin/products" method="get">
        <input className="input" name="q" defaultValue={q} placeholder="Search SKU / name / color" />
      </form>
      <ul className="space-y-2">
        {variants.map((v) => (
          <li key={v.id}>
            <Link className="card block" href={`/admin/products/${v.id}`}>
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{v.designName}</p>
                  <p className="text-xs text-karni-700">{[v.color, v.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700">{v.sku}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{Math.round(Number(v.priceAmd)).toLocaleString()} ֏</p>
                  <p className="text-xs text-karni-700">{v.status}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
