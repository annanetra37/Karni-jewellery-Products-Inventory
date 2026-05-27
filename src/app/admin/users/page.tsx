import { requireAdmin, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { publicOrigin } from '@/lib/origin';
import { sendEmail, wrap } from '@/lib/email';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { CopyButton } from '@/components/CopyButton';
import { PasswordInput } from '@/components/PasswordInput';

async function inviteAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const fullName = String(formData.get('fullName') || '').trim();
  const role = String(formData.get('role') || 'SALES') as 'SALES' | 'ADMIN';
  if (!email || !fullName) return;
  const token = randomBytes(24).toString('hex');
  await prisma.user.upsert({
    where: { email },
    create: { email, fullName, role, inviteToken: token, isActive: true },
    update: { fullName, role, inviteToken: token, isActive: true, passwordHash: null, inviteAcceptedAt: null },
  });
  const origin = await publicOrigin();
  const url = `${origin}/invite/${token}`;
  sendEmail({
    to: email,
    subject: `You're invited to Karni Sales`,
    html: wrap(
      `Welcome to Karni Sales, ${fullName}`,
      `<p>You have been invited as a <strong>${role === 'ADMIN' ? 'admin' : 'salesperson'}</strong>. Click the button below to set your password and sign in.</p>`,
      { href: url, label: 'Activate my account' },
    ),
  }).catch((e) => console.error('[invite] email failed', e));
  revalidatePath('/admin/users');
}

async function deactivateAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  revalidatePath('/admin/users');
}

async function reactivateAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  await prisma.user.update({ where: { id }, data: { isActive: true } });
  revalidatePath('/admin/users');
}

async function resetPasswordAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const token = randomBytes(24).toString('hex');
  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash: null, inviteToken: token, inviteAcceptedAt: null },
  });
  const origin = await publicOrigin();
  const url = `${origin}/invite/${token}`;
  sendEmail({
    to: user.email,
    subject: 'Reset your Karni Sales password',
    html: wrap(
      'Password reset',
      `<p>An admin reset your password. Click the link below to choose a new one.</p>`,
      { href: url, label: 'Set a new password' },
    ),
  }).catch((e) => console.error('[reset] email failed', e));
  revalidatePath('/admin/users');
}

async function setPasswordDirectlyAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const next = String(formData.get('password') || '');
  if (next.length < 8) return;
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(next), inviteToken: null, inviteAcceptedAt: new Date() },
  });
  revalidatePath('/admin/users');
}

export default async function AdminUsersPage() {
  await requireAdmin();
  const [users, origin] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'desc' } }),
    publicOrigin(),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Invite salespeople, promote admins, reset passwords.</p>
      </header>

      <form action={inviteAction} className="card space-y-3">
        <p className="font-semibold">Invite a new user</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" className="input" name="fullName" placeholder="e.g. Anna Karapetyan" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" name="email" type="email" placeholder="email@example.com" required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select id="role" className="input" name="role" defaultValue="SALES">
            <option value="SALES">Sales</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <button className="btn-primary w-full sm:w-auto" type="submit">Generate invite</button>
        <p className="text-xs text-karni-700">A one-time activation URL will appear in the user's row below. Copy and share it.</p>
      </form>

      <ul className="space-y-3">
        {users.map((u) => {
          const inviteUrl = u.inviteToken ? `${origin}/invite/${u.inviteToken}` : null;
          const pending = !!u.inviteToken;
          return (
            <li key={u.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    {u.fullName}
                    <span className={`chip ${u.role === 'ADMIN' ? 'chip-warn' : ''}`}>{u.role}</span>
                    {!u.isActive && <span className="chip chip-danger">Disabled</span>}
                    {pending && <span className="chip chip-ok">Pending activation</span>}
                  </p>
                  <p className="text-sm text-karni-700">{u.email}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {u.isActive ? (
                    <form action={deactivateAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn-link-danger" type="submit">Deactivate</button>
                    </form>
                  ) : (
                    <form action={reactivateAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn-link" type="submit">Reactivate</button>
                    </form>
                  )}
                </div>
              </div>

              {inviteUrl && (
                <div className="rounded-xl bg-karni-50 border border-karni-100 p-3 space-y-2">
                  <p className="text-xs font-medium text-karni-900">
                    {u.inviteAcceptedAt ? 'New reset link' : 'Activation link'} — share with this user:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono break-all bg-white border border-karni-100 rounded-lg px-2 py-1.5">
                      {inviteUrl}
                    </code>
                    <CopyButton value={inviteUrl} />
                  </div>
                </div>
              )}

              <details className="rounded-xl border border-karni-100 px-3 py-2">
                <summary className="cursor-pointer text-sm text-karni-700 select-none hover:text-karni-900">
                  Reset / set password
                </summary>
                <div className="pt-3 space-y-3">
                  <form action={resetPasswordAction} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Send a reset link</p>
                      <p className="text-xs text-karni-700">Wipes their password and generates a new activation URL above.</p>
                    </div>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="btn-secondary" type="submit">Send reset</button>
                  </form>
                  <form action={setPasswordDirectlyAction} className="space-y-2">
                    <input type="hidden" name="id" value={u.id} />
                    <p className="text-sm font-medium">Or set a temporary password directly</p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <PasswordInput name="password" placeholder="At least 8 characters" minLength={8} required />
                      </div>
                      <button className="btn-secondary" type="submit">Set</button>
                    </div>
                    <p className="text-xs text-karni-700">Tell the user the password verbally; they can change it themselves under <code>/account/password</code>.</p>
                  </form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
