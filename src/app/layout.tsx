import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'Karni Sales',
  description: 'Karni Jewellery POS & Inventory',
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  themeColor: '#fbf7f1',
};

async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;

  return (
    <html lang="en">
      <body className="min-h-screen pb-28">
        {user && (
          <header className="no-print sticky top-0 z-30 appbar">
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white text-sm font-bold shadow-soft" style={{ background: 'linear-gradient(135deg,#2d2520,#1a1612)' }}>K</span>
                Karni Sales
              </Link>
              <nav className="flex items-center gap-1 sm:gap-3 text-sm">
                <Link href="/notifications" className="relative inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-karni-100 transition" aria-label="Notifications">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 shadow">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </Link>
                <Link href="/account/password" className="hidden sm:inline px-2 py-1.5 rounded-lg text-karni-700 hover:text-karni-900 hover:bg-karni-100 transition">
                  {user.fullName}
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button className="px-2 py-1.5 rounded-lg text-karni-700 hover:text-karni-900 hover:bg-karni-100 transition" type="submit">Logout</button>
                </form>
              </nav>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
        {user && <BottomNav />}
      </body>
    </html>
  );
}
