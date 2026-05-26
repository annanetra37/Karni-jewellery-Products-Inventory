import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function markAllRead() {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireUser();
  await prisma.notification.updateMany({ where: { userId: u.id, isRead: false }, data: { isRead: true } });
  revalidatePath('/notifications');
}

export default async function NotificationsPage() {
  const u = await requireUser();
  const notifs = await prisma.notification.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Notifications</h1>
        <form action={markAllRead}><button className="text-sm underline">Mark all read</button></form>
      </div>
      <ul className="space-y-2">
        {notifs.map((n) => (
          <li key={n.id} className={`card ${n.isRead ? '' : 'border-karni-500 border-2'}`}>
            <p className="font-medium">{n.title}</p>
            {n.body && <p className="text-sm text-karni-700">{n.body}</p>}
            <p className="text-[10px] text-karni-700 mt-1">{n.type} · {n.createdAt.toLocaleString()}</p>
          </li>
        ))}
        {notifs.length === 0 && <li className="text-sm text-karni-700 text-center py-6">No notifications.</li>}
      </ul>
    </div>
  );
}
