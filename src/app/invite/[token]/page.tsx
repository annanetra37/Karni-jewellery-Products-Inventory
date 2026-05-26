import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSession, hashPassword } from '@/lib/auth';

async function acceptAction(formData: FormData) {
  'use server';
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  if (!token || password.length < 8) redirect(`/invite/${token}?err=1`);
  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) redirect('/login');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      inviteAcceptedAt: new Date(),
      inviteToken: null,
      isActive: true,
    },
  });
  await createSession(updated.id);
  redirect('/');
}

export default async function InvitePage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const user = await prisma.user.findUnique({ where: { inviteToken: token } });
  if (!user) {
    return <div className="card mt-10 text-center"><p>Invite link invalid or expired.</p></div>;
  }
  return (
    <div className="max-w-sm mx-auto mt-10">
      <div className="card">
        <h1 className="text-xl font-bold mb-1">Welcome, {user.fullName}</h1>
        <p className="text-sm text-karni-700 mb-4">Set a password to activate your account.</p>
        {sp.err && <p className="text-sm text-red-700 mb-3">Password must be at least 8 characters.</p>}
        <form action={acceptAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" defaultValue={user.email} disabled />
          </div>
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input id="password" name="password" type="password" className="input" required minLength={8} />
          </div>
          <button className="btn-primary w-full" type="submit">Activate account</button>
        </form>
      </div>
    </div>
  );
}
