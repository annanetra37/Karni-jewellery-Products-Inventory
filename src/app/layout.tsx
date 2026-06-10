import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { User } from '@prisma/client';
import { BottomNav } from '@/components/BottomNav';
import { BackToHome } from '@/components/BackToHome';
import { I18nProvider } from '@/components/I18nProvider';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { dictFor } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n-server';
import { getLabels } from '@/lib/labels';

export const metadata: Metadata = {
  title: 'Karni Sales',
  description: 'Karni Jewellery POS & Inventory',
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  themeColor: '#2d4a3d',
};

async function unreadCount(user: User): Promise<number> {
  const [own, broadcasts] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    isAdmin(user) ? prisma.notification.count({ where: { userId: null, NOT: { readBy: { has: user.id } } } }) : Promise.resolve(0),
  ]);
  return own + broadcasts;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user) : 0;
  const locale = await getLocale();
  const dict = dictFor(locale);
  const labels = await getLabels(locale);

  return (
    <html lang={locale}>
      <body className="min-h-screen pb-28">
        <I18nProvider dict={dict} locale={locale} labels={labels}>
          {user && (
            <header className="no-print sticky top-0 z-30 appbar">
              <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <BackToHome />
                  <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight display">
                    <span className="logo-mark w-9 h-9 text-base">K</span>
                    <span className="text-[17px]">Karni Sales</span>
                  </Link>
                </div>
                <nav className="flex items-center gap-1 sm:gap-2 text-sm">
                  <LocaleSwitcher />
                  <Link href="/notifications" className="appbar-link relative" aria-label={dict['ab.notifications']}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 shadow" style={{ background: 'var(--accent)', color: '#fff' }}>
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </Link>
                  <Link href="/account/password" className="hidden sm:inline appbar-link">
                    {user.fullName}
                  </Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="appbar-link" type="submit">{dict['ab.logout']}</button>
                  </form>
                </nav>
              </div>
            </header>
          )}
          <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
          {user && <BottomNav />}
        </I18nProvider>
      </body>
    </html>
  );
}
