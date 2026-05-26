import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Karni Sales',
  description: 'Karni Jewellery POS & Inventory',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;

  return (
    <html lang="en">
      <body className="min-h-screen pb-24">
        {user && (
          <header className="no-print sticky top-0 z-30 bg-karni-50/95 backdrop-blur border-b border-karni-100">
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
              <Link href="/" className="font-semibold text-karni-900">Karni Sales</Link>
              <div className="flex items-center gap-3 text-sm">
                <Link href="/notifications" className="relative">
                  Notifs
                  {unread > 0 && (
                    <span className="absolute -top-2 -right-3 bg-red-600 text-white text-[10px] rounded-full px-1.5">
                      {unread}
                    </span>
                  )}
                </Link>
                <span className="hidden sm:inline text-karni-700">{user.fullName}</span>
                <form action="/api/auth/logout" method="post">
                  <button className="text-karni-700 underline" type="submit">Logout</button>
                </form>
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
        {user && (
          <nav className="no-print fixed bottom-0 inset-x-0 bg-white border-t border-karni-100 z-30">
            <div className="mx-auto max-w-5xl grid grid-cols-5 text-xs">
              <Link className="py-3 text-center" href="/sell">Sell</Link>
              <Link className="py-3 text-center" href="/products">Catalog</Link>
              <Link className="py-3 text-center" href="/receive">Receive</Link>
              <Link className="py-3 text-center" href="/kacca">Kacca</Link>
              <Link className="py-3 text-center" href="/orders">Orders</Link>
            </div>
          </nav>
        )}
      </body>
    </html>
  );
}
