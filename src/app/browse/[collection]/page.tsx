import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { BrowseCard } from '@/components/BrowseCard';
import { getT } from '@/lib/i18n-server';

export default async function BrowseCategoriesPage({ params }: { params: Promise<{ collection: string }> }) {
  const user = await requireUser();
  const { t } = await getT();
  const { collection: encoded } = await params;
  const collection = decodeURIComponent(encoded);

  const [rows, meta, exists] = await Promise.all([
    prisma.variant.groupBy({
      by: ['category'],
      where: { status: { not: 'ARCHIVED' }, collection, category: { not: null } },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    }),
    prisma.categoryMeta.findMany(),
    prisma.variant.findFirst({ where: { collection }, select: { id: true } }),
  ]);
  if (!exists) notFound();
  const photos = new Map(meta.map((m) => [m.name, m.imageUrl]));
  const categories = rows
    .map((r) => ({ name: r.category!, count: r._count._all }))
    .filter((c) => c.name);

  return (
    <div className="space-y-4">
      <Link href="/browse" className="btn-link">{t('b.allCollections')}</Link>
      <header>
        <h1 className="page-title">{collection}</h1>
        <p className="page-subtitle">{t('b.pickCategory')}.</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {categories.map((c) => (
          <BrowseCard
            key={c.name}
            href={`/browse/${encodeURIComponent(collection)}/${encodeURIComponent(c.name)}`}
            title={c.name}
            subtitle={`${c.count} ${c.count === 1 ? t('c.item') : t('c.items')}`}
            imageUrl={photos.get(c.name) || null}
          />
        ))}
        {categories.length === 0 && (
          <p className="text-karni-700 text-sm col-span-full text-center py-10">{t('b.noCategories')}</p>
        )}
      </div>

      {isAdmin(user) && (
        <p className="text-xs text-karni-700 text-center">
          Admin: upload category photos in <Link href="/admin/categories" className="underline font-medium">Admin → Categories</Link>.
        </p>
      )}
    </div>
  );
}
