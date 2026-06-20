import Link from 'next/link';
import { requireUser, isSuperAdmin, isAdmin } from '@/lib/auth';
import { ensureBirthdayReminders } from '@/lib/birthdays';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n-server';
import { Icon, chipClass, iconWrapClass, metaFor, timeAgo } from './parts';

async function markAllRead() {
  'use server';
  const { requireUser, isAdmin } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireUser();
  // Own notifications.
  await prisma.notification.updateMany({ where: { userId: u.id, isRead: false }, data: { isRead: true } });
  // Admin broadcasts: record this admin as having read them.
  if (isAdmin(u)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Notification" SET "readBy" = array_append("readBy", $1) WHERE "userId" IS NULL AND NOT ($1 = ANY("readBy"))`,
      u.id,
    );
  }
  revalidatePath('/notifications');
}

export default async function NotificationsPage() {
  const u = await requireUser();
  const { t } = await getT();
  if (isSuperAdmin(u)) {
    try { await ensureBirthdayReminders(); } catch (e) { console.error('[birthday] reminder check failed', e); }
  }
  const admin = isAdmin(u);
  // Own notifications + admin-wide broadcasts (visible to every admin).
  const [notifs, userUnread, broadcastUnread] = await Promise.all([
    prisma.notification.findMany({
      where: admin ? { OR: [{ userId: u.id }, { userId: null }] } : { userId: u.id },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.notification.count({ where: { userId: u.id, isRead: false } }),
    admin ? prisma.notification.count({ where: { userId: null, NOT: { readBy: { has: u.id } } } }) : Promise.resolve(0),
  ]);
  const unread = userUnread + broadcastUnread;
  // A notification is unread for this user when: a broadcast they haven't read,
  // or a personal one not marked read.
  const isUnread = (n: { userId: string | null; isRead: boolean; readBy: string[] }) =>
    n.userId === null ? !n.readBy.includes(u.id) : !n.isRead;
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t('n.title')}</h1>
          <p className="page-subtitle">{unread > 0 ? `${unread} ${t('n.unread')}` : t('n.allRead')}</p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="btn-secondary">{t('n.markAllRead')}</button>
          </form>
        )}
      </header>

      <ul className="space-y-2">
        {notifs.map((n) => {
          const meta = metaFor(n.type, n.body);
          const unreadHere = isUnread(n);
          return (
            <li key={n.id}>
              <Link
                href={`/notifications/${n.id}`}
                className={`card flex gap-3 transition hover:shadow-md hover:border-karni-400 ${unreadHere ? 'border-karni-500 shadow-md' : 'opacity-80'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconWrapClass(meta.tone)}`}>
                  <Icon name={meta.icon} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold truncate">{n.title}</p>
                    <span className="text-xs text-karni-700 whitespace-nowrap" title={n.createdAt.toLocaleString()}>{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.body && <p className="text-sm text-karni-700 mt-0.5 line-clamp-2">{n.body}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={chipClass(meta.tone)}>{t(meta.key)}</span>
                    <span className="text-[11px] text-karni-700">{n.createdAt.toLocaleString()}</span>
                    {unreadHere && <span className="chip chip-ok">{t('n.new')}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {notifs.length === 0 && (
          <li className="card text-center py-10 text-karni-700">
            <p className="text-sm">{t('n.empty')}</p>
          </li>
        )}
      </ul>
    </div>
  );
}
