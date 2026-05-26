import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSession, verifyPassword, getCurrentUser } from '@/lib/auth';

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
    <div className="max-w-sm mx-auto mt-10">
      <div className="card">
        <h1 className="text-2xl font-bold mb-1">Karni Sales</h1>
        <p className="text-sm text-karni-700 mb-4">Sign in to continue.</p>
        {sp.err && <p className="text-sm text-red-700 mb-3">Wrong email or password.</p>}
        <form action={loginAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          <button className="btn-primary w-full" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}
