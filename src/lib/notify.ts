import { prisma } from './db';
import type { NotificationType, Prisma } from '@prisma/client';
import { sendEmail, wrap } from './email';

type NotifyArgs = {
  type: NotificationType;
  title: string;
  body?: string;
  relatedId?: string;
  toAdmins?: boolean;
  userId?: string;
  /** Also send by email when Resend is configured. */
  email?: boolean;
  /** Rich HTML for the email body; falls back to the escaped `body` text. */
  bodyHtml?: string;
  /** Optional call-to-action button in the email. */
  cta?: { href: string; label: string };
};

export async function notify(args: NotifyArgs, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  let recipients: { id: string; email: string }[] = [];
  if (args.toAdmins) {
    const admins = await tx.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, email: true } });
    recipients = admins;
    // A single broadcast row (userId = null) so EVERY admin — including ones
    // added or promoted later — sees it. Read state is tracked per admin.
    await tx.notification.create({
      data: {
        userId: null,
        type: args.type,
        title: args.title,
        body: args.body,
        relatedId: args.relatedId,
      },
    });
  } else if (args.userId) {
    const u = await tx.user.findUnique({ where: { id: args.userId }, select: { id: true, email: true } });
    if (u) recipients = [u];
    await tx.notification.create({
      data: {
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        relatedId: args.relatedId,
      },
    });
  }

  if (args.email !== false && recipients.length > 0) {
    // Fire-and-forget: don't block the caller.
    const body = args.bodyHtml ?? (args.body ? `<p>${escapeHtml(args.body)}</p>` : '');
    sendEmail({
      to: recipients.map((r) => r.email),
      subject: args.title,
      html: wrap(args.title, body, args.cta),
    }).catch((e) => console.error('[notify] email fire-forget failed', e));
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
