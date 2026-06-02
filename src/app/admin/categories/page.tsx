import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { ImageUploadField } from '@/components/ImageUploadField';

async function saveAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const name = String(formData.get('name') || '').trim();
  const imageUrl = String(formData.get('imageUrl') || '').trim() || null;
  if (!name) return;
  await prisma.categoryMeta.upsert({
    where: { name },
    create: { name, imageUrl },
    update: { imageUrl },
  });
  revalidatePath('/admin/categories');
  revalidatePath('/browse');
}

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const [rows, meta] = await Promise.all([
    prisma.variant.groupBy({
      by: ['category'],
      where: { status: { not: 'ARCHIVED' }, category: { not: null } },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    }),
    prisma.categoryMeta.findMany(),
  ]);
  const photos = new Map(meta.map((m) => [m.name, m.imageUrl]));

  return (
    <div className="space-y-4">
      <Link href="/browse" className="btn-link">← Browse</Link>
      <header>
        <h1 className="page-title">Category photos</h1>
        <p className="page-subtitle">Upload the photo for each category. Shown when you tap a collection on the browse page.</p>
      </header>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const name = r.category!;
          return (
            <li key={name} className="card">
              <form action={saveAction} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{name}</p>
                  <span className="chip">{r._count._all} variants</span>
                </div>
                <input type="hidden" name="name" value={name} />
                <ImageUploadField defaultValue={photos.get(name) || ''} />
                <button className="btn-primary" type="submit">Save photo</button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
