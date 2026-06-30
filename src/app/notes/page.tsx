import { requireUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

async function createNote(formData: FormData) {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireUser();
  const body = String(formData.get('body') || '').trim().slice(0, 2000);
  if (!body) return;
  await prisma.teamNote.create({ data: { body, authorId: u.id } });
  revalidatePath('/notes');
  revalidatePath('/');
}

async function resolveNote(formData: FormData) {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireUser();
  const id = String(formData.get('id') || '');
  await prisma.teamNote.update({ where: { id }, data: { resolvedAt: new Date(), resolvedById: u.id } });
  revalidatePath('/notes');
  revalidatePath('/');
}

async function reopenNote(formData: FormData) {
  'use server';
  const { requireUser } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  await requireUser();
  const id = String(formData.get('id') || '');
  await prisma.teamNote.update({ where: { id }, data: { resolvedAt: null, resolvedById: null } });
  revalidatePath('/notes');
  revalidatePath('/');
}

async function deleteNote(formData: FormData) {
  'use server';
  const { requireUser, isAdmin } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireUser();
  const id = String(formData.get('id') || '');
  const note = await prisma.teamNote.findUnique({ where: { id }, select: { authorId: true } });
  if (!note) return;
  // The author can remove their own note; admins can remove any.
  if (note.authorId !== u.id && !isAdmin(u)) return;
  await prisma.teamNote.delete({ where: { id } });
  revalidatePath('/notes');
  revalidatePath('/');
}

export default async function NotesPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { t } = await getT();
  const [open, resolved] = await Promise.all([
    prisma.teamNote.findMany({
      where: { resolvedAt: null }, orderBy: { createdAt: 'desc' },
      include: { author: { select: { fullName: true } } },
    }),
    prisma.teamNote.findMany({
      where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: 'desc' }, take: 30,
      include: { author: { select: { fullName: true } }, resolvedBy: { select: { fullName: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{t('tn.title')}</h1>
        <p className="page-subtitle">{t('tn.subtitle')}</p>
      </header>

      <form action={createNote} className="card space-y-2">
        <textarea name="body" required maxLength={2000} className="input min-h-[80px]" placeholder={t('tn.placeholder')} />
        <button type="submit" className="btn-primary w-full">{t('tn.post')}</button>
      </form>

      <section className="space-y-2">
        <p className="font-semibold text-sm">{t('tn.open')} {open.length > 0 && <span style={{ color: 'var(--ink-soft)' }}>({open.length})</span>}</p>
        {open.length === 0 ? (
          <div className="card text-center py-6 text-sm" style={{ color: 'var(--ink-soft)' }}>{t('tn.none')}</div>
        ) : (
          <ul className="space-y-2">
            {open.map((n) => (
              <li key={n.id} className="card space-y-2" style={{ borderColor: 'var(--accent)' }}>
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{n.author.fullName} · {n.createdAt.toLocaleString()}</p>
                  <div className="flex items-center gap-2">
                    <form action={resolveNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="btn-secondary text-xs px-3 py-1.5">{t('tn.markDone')}</button>
                    </form>
                    {(admin || n.authorId === user.id) && (
                      <form action={deleteNote}>
                        <input type="hidden" name="id" value={n.id} />
                        <button type="submit" className="btn-link text-xs text-red-700">{t('c.delete')}</button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <details className="card">
          <summary className="font-semibold text-sm cursor-pointer select-none">{t('tn.resolved')} ({resolved.length})</summary>
          <ul className="space-y-2 mt-3">
            {resolved.map((n) => (
              <li key={n.id} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                <p className="whitespace-pre-wrap break-words text-sm" style={{ color: 'var(--ink-soft)' }}>{n.body}</p>
                <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
                  <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                    {n.author.fullName} · {t('tn.doneBy')} {n.resolvedBy?.fullName ?? '—'}{n.resolvedAt ? ` · ${n.resolvedAt.toLocaleString()}` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <form action={reopenNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="btn-link text-xs">{t('tn.reopen')}</button>
                    </form>
                    {(admin || n.authorId === user.id) && (
                      <form action={deleteNote}>
                        <input type="hidden" name="id" value={n.id} />
                        <button type="submit" className="btn-link text-xs text-red-700">{t('c.delete')}</button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
