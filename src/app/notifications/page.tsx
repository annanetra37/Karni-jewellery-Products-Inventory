import { requireUser, isSuperAdmin } from '@/lib/auth';
import { ensureBirthdayReminders } from '@/lib/birthdays';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n-server';

async function markAllRead() {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireUser();
  await prisma.notification.updateMany({ where: { userId: u.id, isRead: false }, data: { isRead: true } });
  revalidatePath('/notifications');
}

const META: Record<string, { key: string; tone: 'warn' | 'danger' | 'ok' | 'info'; icon: 'box' | 'cart' | 'cash' | 'mail' | 'gift' }> = {
  LOW_STOCK: { key: 'n.lowStock', tone: 'warn', icon: 'box' },
  NEW_ORDER: { key: 'n.newOrder', tone: 'ok', icon: 'cart' },
  KACCA_MISMATCH: { key: 'n.kacca', tone: 'danger', icon: 'cash' },
  INVITE: { key: 'n.invite', tone: 'info', icon: 'mail' },
  BIRTHDAY: { key: 'n.birthday', tone: 'info', icon: 'gift' },
};

function Icon({ name }: { name: 'box' | 'cart' | 'cash' | 'mail' | 'gift' }) {
  const c = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'box') return (<svg {...c}><path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>);
  if (name === 'cart') return (<svg {...c}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg>);
  if (name === 'cash') return (<svg {...c}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>);
  if (name === 'gift') return (<svg {...c}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" /></svg>);
  return (<svg {...c}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>);
}

function timeAgo(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default async function NotificationsPage() {
  const u = await requireUser();
  const { t } = await getT();
  if (isSuperAdmin(u)) {
    try { await ensureBirthdayReminders(); } catch (e) { console.error('[birthday] reminder check failed', e); }
  }
  const [notifs, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.notification.count({ where: { userId: u.id, isRead: false } }),
  ]);
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
          const meta = META[n.type] || { key: 'n.' + n.type, tone: 'info' as const, icon: 'mail' as const };
          const tone = `chip ${meta.tone === 'warn' ? 'chip-warn' : meta.tone === 'danger' ? 'chip-danger' : meta.tone === 'ok' ? 'chip-ok' : ''}`;
          return (
            <li key={n.id} className={`card flex gap-3 ${n.isRead ? 'opacity-80' : 'border-karni-500 shadow-md'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                meta.tone === 'warn' ? 'bg-amber-100 text-amber-800' :
                meta.tone === 'danger' ? 'bg-red-100 text-red-800' :
                meta.tone === 'ok' ? 'bg-emerald-100 text-emerald-800' :
                'bg-karni-100 text-karni-900'
              }`}>
                <Icon name={meta.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold truncate">{n.title}</p>
                  <span className="text-xs text-karni-700 whitespace-nowrap" title={n.createdAt.toLocaleString()}>{timeAgo(n.createdAt)}</span>
                </div>
                {n.body && <p className="text-sm text-karni-700 mt-0.5">{n.body}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={tone}>{t(meta.key)}</span>
                  <span className="text-[11px] text-karni-700">{n.createdAt.toLocaleString()}</span>
                  {!n.isRead && <span className="chip chip-ok">{t('n.new')}</span>}
                </div>
              </div>
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
