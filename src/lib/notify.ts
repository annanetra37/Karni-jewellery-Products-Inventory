import { prisma } from './db';
import type { NotificationType, Prisma } from '@prisma/client';

type NotifyArgs = {
  type: NotificationType;
  title: string;
  body?: string;
  relatedId?: string;
  toAdmins?: boolean;
  userId?: string;
};

export async function notify(args: NotifyArgs, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  if (args.toAdmins) {
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    await tx.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: args.type,
        title: args.title,
        body: args.body,
        relatedId: args.relatedId,
      })),
    });
  } else if (args.userId) {
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
}
