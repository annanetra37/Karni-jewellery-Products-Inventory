import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSession, verifyPassword, getCurrentUser } from '@/lib/auth';
import { PasswordInput } from '@/components/PasswordInput';
import { getT } from '@/lib/i18n-server';

async function loginAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const password = String(formData.get('password') || '');
  if (!email || !password) return;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !user.isActive) {
    redirect('/login?err=1');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) redirect('/login?err=1');
  await createSession(user.id);
  redirect('/');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const u = await getCurrentUser();
  if (u) redirect('/');
  const sp = await searchParams;
  const { t } = await getT();
  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card space-y-4">
        <div className="text-center space-y-1">
          <div className="mx-auto logo-mark w-14 h-14 text-xl">K</div>
          <h1 className="display text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-deep)' }}>Karni Sales</h1>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('l.signInToContinue')}</p>
        </div>
        {sp.err && <p className="banner-danger">{t('l.wrong')}</p>}
        <form action={loginAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">{t('l.email')}</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="email@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="password">{t('l.password')}</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" />
          </div>
          <button className="btn-primary w-full" type="submit">{t('l.signIn')}</button>
        </form>
      </div>
    </div>
  );
}
