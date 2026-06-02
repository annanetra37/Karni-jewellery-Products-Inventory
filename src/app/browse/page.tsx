import Link from 'next/link';
import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { BrowseCard } from '@/components/BrowseCard';

export default async function BrowseCollectionsPage() {
  const user = await requireUser();
  const [rows, meta] = await Promise.all([
    prisma.variant.groupBy({
      by: ['collection'],
      where: { status: { not: 'ARCHIVED' }, collection: { not: null } },
      _count: { _all: true },
      orderBy: { collection: 'asc' },
    }),
    prisma.collectionMeta.findMany(),
  ]);
  const photos = new Map(meta.map((m) => [m.name, m.imageUrl]));
  const collections = rows
    .map((r) => ({ name: r.collection!, count: r._count._all }))
    .filter((c) => c.name);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Browse the catalog</h1>
          <p className="page-subtitle">Pick a collection.</p>
        </div>
        <Link href="/products" className="btn-link">Search & filter →</Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {collections.map((c) => (
          <BrowseCard
            key={c.name}
            href={`/browse/${encodeURIComponent(c.name)}`}
            title={c.name}
            subtitle={`${c.count} ${c.count === 1 ? 'item' : 'items'}`}
            imageUrl={photos.get(c.name) || null}
          />
        ))}
        {collections.length === 0 && (
          <p className="text-karni-700 text-sm col-span-full text-center py-10">No collections yet.</p>
        )}
      </div>

      {isAdmin(user) && (
        <p className="text-xs text-karni-700 text-center">
          Admin: upload collection photos in <Link href="/admin/collections" className="underline font-medium">Admin → Collections</Link>.
        </p>
      )}
    </div>
  );
}
