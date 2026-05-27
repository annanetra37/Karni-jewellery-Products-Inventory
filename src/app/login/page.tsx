import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSession, verifyPassword, getCurrentUser } from '@/lib/auth';
import { PasswordInput } from '@/components/PasswordInput';

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
  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card space-y-4">
        <div className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 rounded-2xl text-white text-lg font-bold flex items-center justify-center shadow-lift" style={{ background: 'linear-gradient(135deg,#2d2520,#1a1612)' }}>K</div>
          <h1 className="text-2xl font-bold tracking-tight">Karni Sales</h1>
          <p className="text-sm text-karni-700">Sign in to continue.</p>
        </div>
        {sp.err && <p className="banner-danger">Wrong email or password.</p>}
        <form action={loginAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="email@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" />
          </div>
          <button className="btn-primary w-full" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
