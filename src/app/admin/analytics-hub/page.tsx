import { requireAdmin } from '@/lib/auth';
import { getT } from '@/lib/i18n-server';
import Link from 'next/link';

export default async function AnalyticsHubPage() {
  await requireAdmin();
  const { t } = await getT();
  const cards = [
    { href: '/admin/inventory', label: t('h.inventory') },          // Inventory Analytics
    { href: '/admin/sales-analytics', label: t('h.salesAnalytics') }, // Sales Analytics
    { href: '/admin/customer-analytics', label: t('h.customerAnalytics') }, // Customer Analytics
    { href: '/admin/analytics', label: t('h.inStockAnalytics') },    // In Stock Analytics
    { href: '/admin/safe', label: t('h.safe') },                     // Safe / Money
  ];
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('h.karniAnalytics')}</h1>
      <div className="grid sm:grid-cols-3 gap-3">
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
