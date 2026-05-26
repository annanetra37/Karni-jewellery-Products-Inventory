import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';

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

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Users</h1>
      <form action={inviteAction} className="card space-y-2">
        <p className="font-medium">Invite a salesperson</p>
        <input className="input" name="fullName" placeholder="Full name" required />
        <input className="input" name="email" placeholder="Email" type="email" required />
        <select className="input" name="role" defaultValue="SALES">
          <option value="SALES">Sales</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className="btn-primary w-full" type="submit">Send invite</button>
        <p className="text-xs text-karni-700">After saving, share the invite URL with the new user (shown in the list below).</p>
      </form>

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{u.fullName} <span className="chip ml-2">{u.role}</span></p>
                <p className="text-xs text-karni-700">{u.email} · {u.isActive ? 'active' : 'disabled'}</p>
                {u.inviteToken && (
                  <p className="text-[10px] text-karni-700 font-mono break-all mt-1">
                    Invite URL: /invite/{u.inviteToken}
                  </p>
                )}
              </div>
              {u.isActive ? (
                <form action={deactivateAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="text-red-700 text-sm underline">Deactivate</button>
                </form>
              ) : (
                <form action={reactivateAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="text-emerald-700 text-sm underline">Reactivate</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
