import Link from 'next/link';
import { getCurrentUser, isAdmin, isSuperAdmin } from '@/lib/auth';
import { ensureBirthdayReminders } from '@/lib/birthdays';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { getT } from '@/lib/i18n-server';

export default async function HomePage() {
  const user = await getCurrentUser();
  const { t } = await getT();
  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="card text-center space-y-4">
          <div className="mx-auto logo-mark w-16 h-16 text-2xl">K</div>
          <h1 className="display text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-deep)' }}>Karni Sales</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Point-of-sale and inventory for Karni Jewellery.</p>
          <Link href="/login" className="btn-primary inline-flex">{t('l.signIn')}</Link>
        </div>
      </div>
    );
  }

  // Lazily surface birthday reminders for super admins (no scheduler needed;
  // de-duped so it's safe on every load).
  if (isSuperAdmin(user)) {
    try { await ensureBirthdayReminders(); } catch (e) { console.error('[birthday] reminder check failed', e); }
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [todaySalesCount, todayTotalAgg, openShift, lowStock] = await Promise.all([
    prisma.sale.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.sale.aggregate({ _sum: { totalAmd: true }, where: { createdAt: { gte: todayStart } } }),
    prisma.cashDrawerSession.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      include: { sellingPoint: true },
    }),
    prisma.inventoryItem.count({ where: { quantity: { lte: 2 } } }),
  ]);

  return (
    <div className="space-y-4">
      <section>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('h.welcome')}</p>
        <h1 className="page-title">{user.fullName}</h1>
        <p className="page-subtitle">{t('h.signedInAs')} {user.email} · <span className="chip">{user.role}</span></p>
      </section>

      {openShift ? (
        <Link href="/kacca" className="card-interactive block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)' }}></span>
                <p className="text-sm font-semibold" style={{ color: 'var(--brand-deep)' }}>{t('h.shiftOpenAt')} {openShift.sellingPoint.name}</p>
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('h.openingCount')} {formatAmd(Number(openShift.openingCountAmd))} · {t('h.started')} {openShift.openingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <span style={{ color: 'var(--ink-soft)' }}>›</span>
          </div>
        </Link>
      ) : (
        <Link href="/kacca" className="card-interactive block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--accent-deep)' }}>{t('h.noShift')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{t('h.tapToStart')}</p>
            </div>
            <span style={{ color: 'var(--ink-soft)' }}>›</span>
          </div>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Link href="/sales?range=today" className="card-interactive block">
          <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('h.salesToday')}</p>
          <p className="display text-3xl font-semibold mt-1" style={{ color: 'var(--brand-deep)' }}>{todaySalesCount}</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>{t('h.viewDetails')} →</p>
        </Link>
        <Link href="/sales?range=today" className="card-interactive block">
          <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('h.revenueToday')}</p>
          <p className="display text-2xl font-semibold mt-1" style={{ color: 'var(--brand-deep)' }}>{formatAmd(Number(todayTotalAgg._sum.totalAmd ?? 0))}</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>{t('h.viewDetails')} →</p>
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/sell" className="btn-primary">{t('h.startSale')}</Link>
        <Link href="/receive" className="btn-secondary">{t('h.receiveStock')}</Link>
        <Link href="/orders/new" className="btn-secondary">{t('h.newOrder')}</Link>
        <Link href="/customers" className="btn-secondary">{t('h.customers')}</Link>
      </section>

      {isAdmin(user) && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{t('h.admin')}</p>
            <span className="chip">{lowStock} {t('h.lowOrOut')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {isSuperAdmin(user) && <Link href="/admin/users" className="btn-secondary">{t('h.users')}</Link>}
            <Link href="/admin/products" className="btn-secondary">{t('h.products')}</Link>
            <Link href="/admin/inventory" className="btn-secondary">{t('h.inventory')}</Link>
            <Link href="/admin/analytics" className="btn-accent">{t('h.analytics')}</Link>
            <Link href="/admin/sales-analytics" className="btn-accent">{t('h.salesAnalytics')}</Link>
            <Link href="/admin/safe" className="btn-secondary">{t('h.safe')}</Link>
            <Link href="/admin/collections" className="btn-secondary">{t('h.collectionPhotos')}</Link>
            <Link href="/admin/categories" className="btn-secondary">{t('h.categoryPhotos')}</Link>
            <Link href="/admin/reports" className="btn-secondary">{t('h.reports')}</Link>
          </div>
        </section>
      )}
    </div>
  );
}
