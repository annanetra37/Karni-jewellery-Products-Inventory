import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { proposeSku, uniqueSku } from '@/lib/sku';
import { saveImage } from '@/lib/upload';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

async function createAction(formData: FormData) {
  'use server';
  await requireAdmin();

  const useExistingDesign = String(formData.get('useExisting') || '') === 'on';
  const existingDesignId = String(formData.get('existingDesignId') || '');

  const designName = String(formData.get('designName') || '').trim();
  const designNameHy = String(formData.get('designNameHy') || '').trim();
  const category = String(formData.get('category') || '').trim() || null;
  const collection = String(formData.get('collection') || '').trim() || null;
  const subcollection = String(formData.get('subcollection') || '').trim() || null;
  const motif = String(formData.get('motif') || '').trim() || null;
  const culturalMeaningEn = String(formData.get('culturalMeaningEn') || '').trim() || null;

  const size = String(formData.get('size') || '').trim() || null;
  const color = String(formData.get('color') || '').trim() || null;
  const priceAmd = Number(formData.get('priceAmd') || 0);
  const costAmd = formData.get('costAmd') ? Number(formData.get('costAmd')) : null;
  const weightG = formData.get('weightG') ? Number(formData.get('weightG')) : null;
  const reorderPoint = Number(formData.get('reorderPoint') || 2);
  const barcode = String(formData.get('barcode') || '').trim() || null;
  const status = String(formData.get('status') || 'ACTIVE') as 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED' | 'COMING_SOON';

  if (!designName || !priceAmd) redirect('/admin/products/new?err=missing');

  let imageUrl: string | null = null;
  const file = formData.get('imageFile') as File | null;
  if (file && file.size > 0) imageUrl = await saveImage(file);

  let design;
  if (useExistingDesign && existingDesignId) {
    design = await prisma.design.findUnique({ where: { id: existingDesignId } });
    if (!design) redirect('/admin/products/new?err=design');
  } else {
    // Generate a stable Design.designId from name + category + collection
    const baseDesignId = `DSGN-${(category || 'ITEM').slice(0, 4).toUpperCase()}-${designName.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12) || 'NEW'}`;
    let designIdCandidate = baseDesignId;
    let n = 2;
    while (await prisma.design.findUnique({ where: { designId: designIdCandidate }, select: { id: true } })) {
      designIdCandidate = `${baseDesignId}-${n++}`;
    }
    design = await prisma.design.create({
      data: {
        designId: designIdCandidate,
        nameEn: designName, nameHy: designNameHy || null,
        category, collection, subcollection, motif, culturalMeaningEn,
      },
    });
  }

  const sku = await uniqueSku(proposeSku({
    category: category || design.category, collection: collection || design.collection,
    subcollection: subcollection || design.subcollection,
    size, color, designName,
  }));

  const fx = await prisma.fxRate.findMany();
  const r: Record<string, number> = {};
  fx.forEach((x) => { r[x.currency] = Number(x.ratePerAmd); });

  const searchBlob = [
    sku, designName, category, collection, subcollection, size, color, barcode,
  ].filter(Boolean).map((s) => String(s).toLowerCase()).join(' ');

  const variant = await prisma.variant.create({
    data: {
      sku, designId: design.id, designName,
      category: category || design.category,
      collection: collection || design.collection,
      subcollection: subcollection || design.subcollection,
      size, color, priceAmd, costAmd: costAmd ?? undefined,
      weightG: weightG ?? undefined,
      barcode: barcode ?? undefined,
      reorderPoint, status, imageUrl,
      priceUsd: r.USD ? priceAmd * r.USD : undefined,
      priceEur: r.EUR ? priceAmd * r.EUR : undefined,
      priceRub: r.RUB ? priceAmd * r.RUB : undefined,
      searchBlob,
    },
  });
  revalidatePath('/admin/products');
  redirect(`/admin/products/${variant.id}`);
}

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const designs = await prisma.design.findMany({
    orderBy: { nameEn: 'asc' },
    select: { id: true, designId: true, nameEn: true, category: true, collection: true, subcollection: true },
    take: 500,
  });

  return (
    <div className="space-y-4">
      <Link href="/admin/products" className="btn-link">← Back to products</Link>
      <header>
        <h1 className="page-title">New product</h1>
        <p className="page-subtitle">SKU is auto-generated from category + collection + size + color. You can edit it later.</p>
      </header>
      {sp.err === 'missing' && <p className="banner-danger">Design name and price are required.</p>}

      <form action={createAction} className="card space-y-4" encType="multipart/form-data">
        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Photo</legend>
          <div>
            <label className="label" htmlFor="imageFile">Upload an image (optional)</label>
            <input id="imageFile" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="input" />
            <p className="text-xs text-karni-700 mt-1">JPEG / PNG / WebP / GIF, up to 5 MB.</p>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Design</legend>
          <details className="rounded-xl border border-karni-100 px-3 py-2">
            <summary className="cursor-pointer text-sm text-karni-700 select-none hover:text-karni-900">
              Use an existing design (add a new color/size to it)
            </summary>
            <div className="pt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="useExisting" className="accent-karni-600" /> Pick from existing designs
              </label>
              <select className="input" name="existingDesignId" defaultValue="">
                <option value="">— select —</option>
                {designs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nameEn} · {[d.category, d.collection, d.subcollection].filter(Boolean).join(' / ')}
                  </option>
                ))}
              </select>
              <p className="text-xs text-karni-700">When checked, the design fields below are ignored.</p>
            </div>
          </details>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Design name (EN) *</label>
              <input className="input" name="designName" required placeholder="e.g. Bird Letter Pendant" />
            </div>
            <div>
              <label className="label">Design name (HY)</label>
              <input className="input" name="designNameHy" placeholder="Թռչնագիր կախազարդ" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" name="category" defaultValue="">
                <option value="">—</option>
                <option>Pendant</option><option>Earring</option><option>Ring</option>
                <option>Bracelet</option><option>Necklace</option><option>Brooch</option>
              </select>
            </div>
            <div>
              <label className="label">Collection</label>
              <input className="input" name="collection" placeholder="Alphabet" />
            </div>
            <div>
              <label className="label">Subcollection</label>
              <input className="input" name="subcollection" placeholder="Ա" />
            </div>
            <div>
              <label className="label">Motif / symbol</label>
              <input className="input" name="motif" />
            </div>
          </div>
          <div>
            <label className="label">Cultural meaning</label>
            <textarea className="input" name="culturalMeaningEn" rows={2} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Variant</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Size</label>
              <select className="input" name="size" defaultValue="">
                <option value="">—</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div>
              <label className="label">Color</label>
              <input className="input" name="color" placeholder="red" />
            </div>
            <div>
              <label className="label">Barcode</label>
              <input className="input" name="barcode" placeholder="optional" />
            </div>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Price (AMD) *</label>
              <input className="input" name="priceAmd" type="number" step="0.01" min="0" required />
            </div>
            <div>
              <label className="label">Cost (AMD)</label>
              <input className="input" name="costAmd" type="number" step="0.01" min="0" />
            </div>
            <div>
              <label className="label">Weight (g)</label>
              <input className="input" name="weightG" type="number" step="0.001" min="0" />
            </div>
            <div>
              <label className="label">Reorder point</label>
              <input className="input" name="reorderPoint" type="number" min={0} defaultValue={2} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" name="status" defaultValue="ACTIVE">
              <option value="ACTIVE">Active</option>
              <option value="COMING_SOON">Coming soon</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </select>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1" type="submit">Create product</button>
          <Link href="/admin/products" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
