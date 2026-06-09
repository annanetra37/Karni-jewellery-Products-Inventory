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
  const nameHy = String(formData.get('nameHy') || '').trim() || null;
  const nameRu = String(formData.get('nameRu') || '').trim() || null;
  if (!name) return;
  await prisma.categoryMeta.upsert({
    where: { name },
    create: { name, imageUrl, nameHy, nameRu },
    update: { imageUrl, nameHy, nameRu },
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
  const metaByName = new Map(meta.map((m) => [m.name, m]));

  return (
    <div className="space-y-4">
      <Link href="/browse" className="btn-link">← Browse</Link>
      <header>
        <h1 className="page-title">Categories</h1>
        <p className="page-subtitle">Set the photo and the Armenian / Russian names for each category. The translated name is shown when the app language is switched.</p>
      </header>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const name = r.category!;
          const m = metaByName.get(name);
          return (
            <li key={name} className="card">
              <form action={saveAction} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{name}</p>
                  <span className="chip">{r._count._all} variants</span>
                </div>
                <input type="hidden" name="name" value={name} />
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <label className="label">Armenian name</label>
                    <input className="input" name="nameHy" defaultValue={m?.nameHy || ''} placeholder="օր. շղթա-ապարանջան" />
                  </div>
                  <div>
                    <label className="label">Russian name</label>
                    <input className="input" name="nameRu" defaultValue={m?.nameRu || ''} placeholder="напр. цепочка-браслет" />
                  </div>
                </div>
                <ImageUploadField defaultValue={m?.imageUrl || ''} />
                <button className="btn-primary" type="submit">Save</button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
