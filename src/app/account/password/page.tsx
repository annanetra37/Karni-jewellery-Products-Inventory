import { redirect } from 'next/navigation';
import { requireUser, hashPassword, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PasswordInput } from '@/components/PasswordInput';

async function changePasswordAction(formData: FormData) {
  'use server';
  const u = await requireUser();
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  const confirm = String(formData.get('confirm') || '');
  if (!u.passwordHash || !(await verifyPassword(current, u.passwordHash))) {
    redirect('/account/password?err=wrong');
  }
  if (next.length < 8) redirect('/account/password?err=short');
  if (next !== confirm) redirect('/account/password?err=mismatch');
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(next) },
  });
  redirect('/account/password?ok=1');
}

const MSG: Record<string, { text: string; tone: 'err' | 'ok' }> = {
  wrong: { text: 'Current password is incorrect.', tone: 'err' },
  short: { text: 'New password must be at least 8 characters.', tone: 'err' },
  mismatch: { text: 'New passwords do not match.', tone: 'err' },
};

export default async function ChangePasswordPage({
  searchParams,
}: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const banner = sp.err ? MSG[sp.err] : sp.ok ? { text: 'Password updated.', tone: 'ok' as const } : null;

  return (
    <div className="max-w-sm mx-auto">
      <div className="card space-y-3">
        <header>
          <h1 className="text-xl font-bold">Change password</h1>
          <p className="text-sm text-karni-700">Signed in as {user.email}.</p>
        </header>
        {banner && (
          <p className={`text-sm rounded-lg px-3 py-2 ${
            banner.tone === 'err' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}>{banner.text}</p>
        )}
        <form action={changePasswordAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <PasswordInput id="current" name="current" required autoComplete="current-password" />
          </div>
          <div>
            <label className="label" htmlFor="next">New password</label>
            <PasswordInput id="next" name="next" required minLength={8} autoComplete="new-password" />
            <p className="text-xs text-karni-700 mt-1">At least 8 characters.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm new password</label>
            <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
          </div>
          <button type="submit" className="btn-primary w-full">Update password</button>
        </form>
      </div>
    </div>
  );
}
