import { requireSuperAdmin, hashPassword, getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { publicOrigin } from '@/lib/origin';
import { sendEmail, wrap } from '@/lib/email';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { CopyButton } from '@/components/CopyButton';
import { PasswordInput } from '@/components/PasswordInput';
import { BirthdayField } from '@/components/BirthdayField';

// Always render fresh from the DB — never serve a cached access state.
export const dynamic = 'force-dynamic';

/** Parse a "YYYY-MM-DD" form value into a UTC-midnight Date, or null. */
function parseBirthday(v: unknown): Date | null {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type RoleStr = 'SALES' | 'ADMIN' | 'SUPER_ADMIN';

const ROLE_LABEL: Record<RoleStr, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  SALES: 'Sales',
};

function normalizeRole(v: unknown): RoleStr {
  return v === 'ADMIN' || v === 'SUPER_ADMIN' ? v : 'SALES';
}

/** Replace a user's assigned selling points. Super admins are unrestricted. */
async function syncSellingPoints(userId: string, role: RoleStr, requestedIds: string[]) {
  await prisma.adminSellingPoint.deleteMany({ where: { userId } });
  if (role === 'SUPER_ADMIN' || requestedIds.length === 0) return;
  const valid = new Set((await prisma.sellingPoint.findMany({ select: { id: true } })).map((s) => s.id));
  const ids = requestedIds.filter((id) => valid.has(id));
  if (ids.length === 0) return;
  await prisma.adminSellingPoint.createMany({
    data: ids.map((sellingPointId) => ({ userId, sellingPointId })),
    skipDuplicates: true,
  });
}

async function inviteAction(formData: FormData) {
  'use server';
  await requireSuperAdmin();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const fullName = String(formData.get('fullName') || '').trim();
  const role = normalizeRole(formData.get('role'));
  const sellingPoints = formData.getAll('sellingPoints').map(String);
  const birthday = parseBirthday(formData.get('birthday'));
  if (!email || !fullName) return;
  const token = randomBytes(24).toString('hex');
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, fullName, birthday, role, inviteToken: token, isActive: true },
    update: { fullName, birthday, role, inviteToken: token, isActive: true, passwordHash: null, inviteAcceptedAt: null },
  });
  await syncSellingPoints(user.id, role, sellingPoints);
  const origin = await publicOrigin();
  const url = `${origin}/invite/${token}`;
  sendEmail({
    to: email,
    subject: `You're invited to Karni Sales`,
    html: wrap(
      `Welcome to Karni Sales, ${fullName}`,
      `<p>You have been invited as a <strong>${ROLE_LABEL[role]}</strong>. Click the button below to set your password and sign in.</p>`,
      { href: url, label: 'Activate my account' },
    ),
  }).catch((e) => console.error('[invite] email failed', e));
  revalidatePath('/admin/users');
}

async function updateAccessAction(formData: FormData) {
  'use server';
  const me = await requireSuperAdmin();
  const id = String(formData.get('id') || '');
  const role = normalizeRole(formData.get('role'));
  if (!id) return;
  // Guard against a super admin accidentally demoting themselves out of access.
  if (id === me.id && role !== 'SUPER_ADMIN') return;
  const birthday = parseBirthday(formData.get('birthday'));
  await prisma.user.update({ where: { id }, data: { role, ...(birthday ? { birthday } : {}) } });
  // Moving to super admin clears any point restriction.
  if (role === 'SUPER_ADMIN') await prisma.adminSellingPoint.deleteMany({ where: { userId: id } });
  revalidatePath('/admin/users');
}

/** Save ONLY a user's selling-point access (its own form, so role saves can't wipe it). */
async function updateSellingPointsAction(formData: FormData) {
  'use server';
  await requireSuperAdmin();
  const id = String(formData.get('id') || '');
  if (!id) return;
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return;
  const selected = formData.getAll('sellingPoints').map(String);
  await syncSellingPoints(id, target.role as RoleStr, selected);
  revalidatePath('/admin/users');
}

async function deactivateAction(formData: FormData) {
  'use server';
  await requireSuperAdmin();
  const id = String(formData.get('id') || '');
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  revalidatePath('/admin/users');
}

async function reactivateAction(formData: FormData) {
  'use server';
  await requireSuperAdmin();
  const id = String(formData.get('id') || '');
  await prisma.user.update({ where: { id }, data: { isActive: true } });
  revalidatePath('/admin/users');
}

async function resetPasswordAction(formData: FormData) {
  'use server';
  await requireSuperAdmin();
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
  await requireSuperAdmin();
  const id = String(formData.get('id') || '');
  const next = String(formData.get('password') || '');
  if (next.length < 8) return;
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(next), inviteToken: null, inviteAcceptedAt: new Date() },
  });
  revalidatePath('/admin/users');
}

function SellingPointPicker({ sellingPoints, selected }: {
  sellingPoints: { id: string; name: string }[];
  selected: Set<string>;
}) {
  return (
    <div>
      <p className="label">Selling points <span className="font-normal normal-case text-karni-700">(restricts Sales &amp; Admins; leave all unchecked for full access)</span></p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {sellingPoints.map((sp) => (
          <label key={sp.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sellingPoints" value={sp.id} defaultChecked={selected.has(sp.id)} className="accent-karni-600" />
            <span style={{ color: 'var(--ink)' }}>{sp.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default async function AdminUsersPage() {
  await requireSuperAdmin();
  const me = await getCurrentUser();
  const [users, sellingPoints, origin] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { adminSellingPoints: { select: { sellingPointId: true } } },
    }),
    prisma.sellingPoint.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    publicOrigin(),
  ]);
  const spName = new Map(sellingPoints.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Assign super admins, point-scoped admins, or salespeople — and manage passwords.</p>
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
            <option value="ADMIN">Admin (specific selling points)</option>
            <option value="SUPER_ADMIN">Super admin (full access)</option>
          </select>
        </div>
        <div>
          <label className="label">Birthday</label>
          <BirthdayField name="birthday" />
        </div>
        <SellingPointPicker sellingPoints={sellingPoints} selected={new Set()} />
        <button className="btn-primary w-full sm:w-auto" type="submit">Generate invite</button>
        <p className="text-xs text-karni-700">A one-time activation URL will appear in the user&apos;s row below. Copy and share it. Selling points apply only when the role is Admin.</p>
      </form>

      <ul className="space-y-3">
        {users.map((u) => {
          const inviteUrl = u.inviteToken ? `${origin}/invite/${u.inviteToken}` : null;
          const pending = !!u.inviteToken;
          const role = u.role as RoleStr;
          const assigned = new Set(u.adminSellingPoints.map((a) => a.sellingPointId));
          const roleChip = role === 'SUPER_ADMIN' ? 'chip-danger' : role === 'ADMIN' ? 'chip-warn' : '';
          return (
            <li key={u.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2 flex-wrap">
                    {u.fullName}
                    <span className={`chip ${roleChip}`}>{ROLE_LABEL[role]}</span>
                    {!u.isActive && <span className="chip chip-danger">Disabled</span>}
                    {pending && <span className="chip chip-ok">Pending activation</span>}
                  </p>
                  <p className="text-sm text-karni-700">{u.email}</p>
                  {u.birthday && (
                    <p className="text-xs text-karni-700 mt-0.5">🎂 {u.birthday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
                  )}
                  <div className="mt-1.5">
                    <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--ink-soft)' }}>Selling-point access</p>
                    {role === 'SUPER_ADMIN' ? (
                      <span className="chip chip-ok">All selling points (full access)</span>
                    ) : assigned.size > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {[...assigned].map((id) => <span key={id} className="chip chip-accent">{spName.get(id) || id}</span>)}
                      </div>
                    ) : (
                      <span className="chip">All selling points · no limit set</span>
                    )}
                  </div>
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

              {/* Selling-point access — its own form so saving role can never wipe it.
                  The `key` re-mounts the checkboxes with fresh state after a save. */}
              {role !== 'SUPER_ADMIN' && (
                <div className="rounded-xl border px-3 py-3 space-y-3" style={{ borderColor: 'var(--brand)', background: 'var(--surface-2)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--brand-deep)' }}>Selling-point access</p>
                  <form key={[...assigned].sort().join(',')} action={updateSellingPointsAction} className="space-y-3">
                    <input type="hidden" name="id" value={u.id} />
                    <p className="text-xs text-karni-700">
                      Tick the points this {role === 'ADMIN' ? 'admin' : 'salesperson'} may use. Leave all unticked for full access.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {sellingPoints.map((sp) => (
                        <label key={sp.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="sellingPoints" value={sp.id} defaultChecked={assigned.has(sp.id)} className="accent-karni-600" />
                          <span style={{ color: 'var(--ink)' }}>{sp.name}</span>
                        </label>
                      ))}
                    </div>
                    <button className="btn-primary" type="submit">Save access</button>
                  </form>
                </div>
              )}

              <details className="rounded-xl border border-karni-100 px-3 py-2">
                <summary className="cursor-pointer text-sm text-karni-700 select-none hover:text-karni-900">
                  Role &amp; birthday
                </summary>
                <form action={updateAccessAction} className="pt-3 space-y-3">
                  <input type="hidden" name="id" value={u.id} />
                  <div>
                    <label className="label">Role</label>
                    <select className="input" name="role" defaultValue={role}>
                      <option value="SALES">Sales</option>
                      <option value="ADMIN">Admin (specific selling points)</option>
                      <option value="SUPER_ADMIN">Super admin (full access)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Birthday</label>
                    <BirthdayField name="birthday" defaultValue={u.birthday ? u.birthday.toISOString().slice(0, 10) : ''} />
                  </div>
                  {u.id === me?.id && (
                    <p className="text-xs text-karni-700">You can&apos;t remove your own super-admin access here.</p>
                  )}
                  <button className="btn-secondary" type="submit">Save role &amp; birthday</button>
                </form>
              </details>

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
