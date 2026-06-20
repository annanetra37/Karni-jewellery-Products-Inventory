import Link from 'next/link';
import { getCurrentUser, isAdmin, isSuperAdmin, sellingPointScope } from '@/lib/auth';
import { ensureBirthdayReminders } from '@/lib/birthdays';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { Clock } from '@/components/Clock';
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
  // Admins (and super admins) oversee shifts they may not have opened
  // themselves, so surface every open shift across the points they cover.
  const scope = await sellingPointScope(user);
  const admin = isAdmin(user);
  const openShiftsWhere = scope
    ? { status: 'OPEN' as const, sellingPointId: { in: scope } }
    : { status: 'OPEN' as const };
  const [todaySalesCount, todayTotalAgg, openShift, lowStock, openShifts] = await Promise.all([
    prisma.sale.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.sale.aggregate({ _sum: { totalAmd: true }, where: { createdAt: { gte: todayStart } } }),
    prisma.cashDrawerSession.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      include: { sellingPoint: true, breaks: { where: { endedAt: null } } },
    }),
    prisma.inventoryItem.count({ where: { quantity: { lte: 2 } } }),
    admin
      ? prisma.cashDrawerSession.findMany({
          where: openShiftsWhere,
          orderBy: { openingAt: 'asc' },
          include: { sellingPoint: true, openingBy: true, breaks: { where: { endedAt: null } } },
        })
      : Promise.resolve([]),
  ]);
  // On the home page, only show OTHER people's open shifts here — the user's own
  // shift already has its dedicated card above.
  const otherOpenShifts = openShifts.filter((s) => s.userId !== user.id);

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('h.welcome')}</p>
          <h1 className="page-title">{user.fullName}</h1>
          <p className="page-subtitle break-words">{t('h.signedInAs')} {user.email} · <span className="chip">{user.role}</span></p>
        </div>
        <Clock />
      </section>

      {openShift ? (
        <Link href="/kacca" className="card-interactive block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: openShift.breaks.length > 0 ? 'var(--warn)' : 'var(--success)' }}></span>
                <p className="text-sm font-semibold" style={{ color: 'var(--brand-deep)' }}>{t('h.shiftOpenAt')} {openShift.sellingPoint.name}</p>
                {openShift.breaks.length > 0 && <span className="chip chip-warn">{t('k.onHold')}</span>}
              </div>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('h.openingCount')} {formatAmd(Number(openShift.openingCountAmd))} · {t('h.started')} {openShift.openingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <span style={{ color: 'var(--ink-soft)' }}>›</span>
          </div>
        </Link>
      ) : otherOpenShifts.length === 0 ? (
        <Link href="/kacca" className="card-interactive block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--accent-deep)' }}>{t('h.noShift')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>{t('h.tapToStart')}</p>
            </div>
            <span style={{ color: 'var(--ink-soft)' }}>›</span>
          </div>
        </Link>
      ) : null}

      {admin && otherOpenShifts.length > 0 && (
        <Link href="/kacca" className="card-interactive block">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--brand-deep)' }}>{t('k.openShifts')}</p>
          <ul className="space-y-1.5">
            {otherOpenShifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: s.breaks.length > 0 ? 'var(--warn)' : 'var(--success)' }}></span>
                  <span className="min-w-0">
                    <span className="font-medium">{s.sellingPoint.name}</span>
                    <span style={{ color: 'var(--ink-soft)' }}> · {t('k.openedBy')} {s.openingBy.fullName}</span>
                    {s.breaks.length > 0 && <span className="chip chip-warn ml-2">{t('k.onHold')}</span>}
                  </span>
                </span>
                <span className="text-xs shrink-0" style={{ color: 'var(--ink-soft)' }}>
                  {t('k.at')} {s.openingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </Link>
      )}

      {/* Store sales figures — only admins, or a sales user with an open shift. */}
      {(admin || openShift) && (
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
      )}

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
            <Link href="/admin/analytics-hub" className="btn-accent">{t('h.karniAnalytics')}</Link>
            <Link href="/admin/photos" className="btn-secondary">{t('h.photos')}</Link>
            {admin && <Link href="/admin/safe" className="btn-secondary">{t('h.safe')}</Link>}
            <Link href="/admin/reports" className="btn-secondary">{t('h.reports')}</Link>
            {isSuperAdmin(user) && <Link href="/admin/health" className="btn-secondary">{t('h.health')}</Link>}
          </div>
        </section>
      )}
    </div>
  );
}
