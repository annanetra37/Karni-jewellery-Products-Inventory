import { requireAdmin } from '@/lib/auth';
import { getT } from '@/lib/i18n-server';
import Link from 'next/link';

export default async function PhotosHubPage() {
  await requireAdmin();
  const { t } = await getT();
  const cards = [
    { href: '/admin/collections', label: t('h.collectionPhotos') },
    { href: '/admin/categories', label: t('h.categoryPhotos') },
  ];
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('h.photos')}</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card-interactive flex items-center justify-between gap-3">
            <span className="font-semibold">{c.label}</span>
            <span aria-hidden="true" style={{ color: 'var(--ink-soft)' }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
