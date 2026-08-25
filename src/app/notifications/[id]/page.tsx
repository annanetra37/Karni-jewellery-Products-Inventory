import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n-server';
import { Icon, chipClass, iconWrapClass, metaFor, relatedLink } from '../parts';
import { RefreshOnMount } from '../RefreshOnMount';

export default async function NotificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { t } = await getT();
  const { id } = await params;

  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) notFound();

  const admin = isAdmin(u);
  // Personal notifications belong to their owner; broadcasts (userId = null) are
  // visible to every admin. Anything else is off-limits.
  const allowed = n.userId === null ? admin : n.userId === u.id;
  if (!allowed) notFound();

  const wasUnread = n.userId === null ? !n.readBy.includes(u.id) : !n.isRead;

  // Mark it read on open. A failure here must never block viewing the details.
  if (wasUnread) {
    try {
      if (n.userId === null) {
        await prisma.$executeRawUnsafe(
          `UPDATE "Notification" SET "readBy" = array_append("readBy", $1) WHERE "id" = $2 AND NOT ($1 = ANY("readBy"))`,
          u.id, n.id,
        );
      } else {
        await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
      }
    } catch (e) {
      console.error('[notifications] mark-read on open failed', e);
    }
  }

  const meta = metaFor(n.type, n.body);
  const link = relatedLink(n.type, n.relatedId);

  return (
    <div className="space-y-4 max-w-2xl">
      <RefreshOnMount active={wasUnread} />

      <Link href="/notifications" className="inline-flex items-center gap-1 text-sm text-karni-700 hover:text-karni-900">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        {t('n.back')}
      </Link>

      <article className="card space-y-4">
        <div className="flex gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconWrapClass(meta.tone)}`}>
            <Icon name={meta.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold leading-snug">{n.title}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={chipClass(meta.tone)}>{t(meta.key)}</span>
              <span className="text-xs text-karni-700">{n.createdAt.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {n.body && <p className="text-karni-800 whitespace-pre-wrap leading-relaxed">{n.body}</p>}

        {link && (
          <Link href={link.href} className="btn-primary inline-flex">{t(link.labelKey)}</Link>
        )}
      </article>
    </div>
  );
}
