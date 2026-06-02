import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Thumb } from '@/components/Thumb';

const SIZE_ORDER: Record<string, number> = { small: 1, medium: 2, large: 3 };

export default async function BrowseVariantsPage({
  params,
}: {
  params: Promise<{ collection: string; category: string }>;
}) {
  await requireUser();
  const { collection: encColl, category: encCat } = await params;
  const collection = decodeURIComponent(encColl);
  const category = decodeURIComponent(encCat);

  const variants = await prisma.variant.findMany({
    where: { status: { not: 'ARCHIVED' }, collection, category },
    orderBy: [{ size: 'asc' }, { color: 'asc' }],
    select: {
      id: true, sku: true, designName: true, size: true, color: true,
      priceAmd: true, imageUrl: true, subcollection: true,
      inventoryItems: { select: { quantity: true } },
    },
  });

  if (variants.length === 0) notFound();

  // Group by size; null/empty bucket goes last.
  const buckets = new Map<string, typeof variants>();
  for (const v of variants) {
    const key = (v.size || '').trim();
    const arr = buckets.get(key) || [];
    arr.push(v);
    buckets.set(key, arr);
  }
  const sizeKeys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return (SIZE_ORDER[a.toLowerCase()] || 99) - (SIZE_ORDER[b.toLowerCase()] || 99);
  });
  const hasMultipleSizes = sizeKeys.filter((k) => k !== '').length > 1;

  return (
    <div className="space-y-5">
      <Link href={`/browse/${encodeURIComponent(collection)}`} className="btn-link">← Back to {collection}</Link>
      <header>
        <h1 className="page-title">{collection} · {category}</h1>
        <p className="page-subtitle">
          {variants.length} {variants.length === 1 ? 'item' : 'items'}
          {hasMultipleSizes && ' · grouped by size'}
        </p>
      </header>

      {sizeKeys.map((sizeKey) => {
        const list = buckets.get(sizeKey)!;
        const label = sizeKey ? sizeKey.charAt(0).toUpperCase() + sizeKey.slice(1) : (hasMultipleSizes ? 'One size' : '');
        return (
          <section key={sizeKey || 'none'} className="space-y-2">
            {hasMultipleSizes && (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-karni-700 mt-2">{label}</h2>
            )}
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {list.map((v) => {
                const qty = v.inventoryItems.reduce((s, i) => s + i.quantity, 0);
                const stockChip = qty <= 0
                  ? <span className="chip chip-danger">Out</span>
                  : qty <= 2
                    ? <span className="chip chip-warn">Low · {qty}</span>
                    : <span className="chip chip-ok">{qty}</span>;
                return (
                  <li key={v.id}>
                    <Link
                      href={`/products?q=${encodeURIComponent(v.sku)}`}
                      className="block rounded-2xl overflow-hidden bg-white border border-karni-100 shadow-soft hover:shadow-lift transition-all hover:-translate-y-0.5"
                    >
                      <div className="aspect-square bg-gradient-to-br from-karni-100 to-karni-50">
                        {v.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.imageUrl} alt={v.designName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Thumb src={null} size={16} />
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <p className="font-semibold text-karni-900 truncate">{v.designName}</p>
                        <p className="text-xs text-karni-700 truncate">{[v.subcollection, v.color].filter(Boolean).join(' · ')}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="font-bold text-sm">{Math.round(Number(v.priceAmd)).toLocaleString()} ֏</p>
                          {stockChip}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
