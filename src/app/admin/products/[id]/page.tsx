import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { METAL_TYPES, FILLING_MATERIALS, PLATING_TYPES, sumCost } from '@/lib/materials';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { BackLink } from '@/components/BackLink';
import { ImageUploadField } from '@/components/ImageUploadField';

async function saveAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const designId = String(formData.get('designId') || '');

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
  const weightG = formData.get('weightG') ? Number(formData.get('weightG')) : null;

  // Cost breakdown
  const metalType = String(formData.get('metalType') || '').trim() || null;
  const metalCostAmd = formData.get('metalCostAmd') ? Number(formData.get('metalCostAmd')) : null;
  const fillingMaterial = String(formData.get('fillingMaterial') || '').trim() || null;
  const fillingCostAmd = formData.get('fillingCostAmd') ? Number(formData.get('fillingCostAmd')) : null;
  const platingType = String(formData.get('platingType') || '').trim() || null;
  const platingCostAmd = formData.get('platingCostAmd') ? Number(formData.get('platingCostAmd')) : null;
  const laborCostAmd = formData.get('laborCostAmd') ? Number(formData.get('laborCostAmd')) : null;
  const breakdown = sumCost({ metalCostAmd, fillingCostAmd, platingCostAmd, laborCostAmd });
  const manualCost = formData.get('costAmd') ? Number(formData.get('costAmd')) : null;
  const costAmd = breakdown > 0 ? breakdown : manualCost;
  const reorderPoint = Number(formData.get('reorderPoint') || 2);
  const barcode = String(formData.get('barcode') || '').trim() || null;
  const status = String(formData.get('status') || 'ACTIVE') as 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED' | 'COMING_SOON';
  const onWebsite = formData.get('onWebsite') === 'on';
  const onEtsy = formData.get('onEtsy') === 'on';
  const onIg = formData.get('onIg') === 'on';
  const inStockists = formData.get('inStockists') === 'on';
  const excludeFromTopSellers = formData.get('excludeFromTopSellers') === 'on';

  // Image was already uploaded to blob storage client-side; we just store the URL.
  const imageUrl = String(formData.get('imageUrl') || '').trim() || null;

  const fx = await prisma.fxRate.findMany();
  const r: Record<string, number> = {};
  fx.forEach((x) => { r[x.currency] = Number(x.ratePerAmd); });

  const searchBlob = [
    designName, category, collection, subcollection, size, color, barcode,
  ].filter(Boolean).map((s) => String(s).toLowerCase()).join(' ');

  await prisma.$transaction(async (tx) => {
    await tx.design.update({
      where: { id: designId },
      data: { nameEn: designName, nameHy: designNameHy || null, category, collection, subcollection, motif, culturalMeaningEn },
    });
    await tx.variant.update({
      where: { id },
      data: {
        designName, category, collection, subcollection, size, color,
        priceAmd, costAmd, weightG, reorderPoint, barcode,
        metalType, metalCostAmd, fillingMaterial, fillingCostAmd,
        platingType, platingCostAmd, laborCostAmd,
        imageUrl, status,
        onWebsite, onEtsy, onIg, inStockists, excludeFromTopSellers,
        priceUsd: r.USD ? priceAmd * r.USD : undefined,
        priceEur: r.EUR ? priceAmd * r.EUR : undefined,
        priceRub: r.RUB ? priceAmd * r.RUB : undefined,
        searchBlob,
      },
    });
  });
  revalidatePath('/admin/products');
  redirect('/admin/products');
}

async function deleteAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const v = await prisma.variant.findUnique({
    where: { id },
    include: { _count: { select: { saleLineItems: true, orderLineItems: true, movements: true } }, design: { include: { _count: { select: { variants: true } } } } },
  });
  if (!v) redirect('/admin/products');
  const hasHistory = v._count.saleLineItems + v._count.orderLineItems + v._count.movements > 0;
  if (hasHistory) {
    await prisma.variant.update({ where: { id }, data: { status: 'ARCHIVED' } });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryItem.deleteMany({ where: { variantId: id } });
      await tx.variant.delete({ where: { id } });
      // If this was the last variant for the design, delete the design too.
      const remaining = await tx.variant.count({ where: { designId: v.designId } });
      if (remaining === 0) await tx.design.delete({ where: { id: v.designId } });
    });
  }
  revalidatePath('/admin/products');
  redirect('/admin/products');
}

async function adjustStockAction(formData: FormData) {
  'use server';
  const { requireAdmin } = await import('@/lib/auth');
  const { prisma } = await import('@/lib/db');
  const { revalidatePath } = await import('next/cache');
  const u = await requireAdmin();
  const variantId = String(formData.get('variantId') || '');
  const sellingPointId = String(formData.get('sellingPointId') || '');
  const newQty = Number(formData.get('newQty') || 0);
  const note = String(formData.get('note') || '') || undefined;

  await prisma.$transaction(async (tx) => {
    const current = await tx.inventoryItem.findUnique({
      where: { variantId_sellingPointId: { variantId, sellingPointId } },
    });
    const oldQty = current?.quantity ?? 0;
    const delta = newQty - oldQty;
    if (delta !== 0) {
      await tx.stockMovement.create({
        data: { variantId, sellingPointId, type: 'ADJUSTMENT', qtyDelta: delta, performedById: u.id, note },
      });
    }
    if (current) {
      await tx.inventoryItem.update({ where: { id: current.id }, data: { quantity: newQty } });
    } else {
      await tx.inventoryItem.create({
        data: { variantId, sellingPointId, quantity: newQty, createdById: u.id },
      });
    }
  });
  revalidatePath(`/admin/products/${variantId}`);
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const v = await prisma.variant.findUnique({
    where: { id },
    include: {
      inventoryItems: { include: { sellingPoint: true, createdBy: true } },
      design: true,
      _count: { select: { saleLineItems: true } },
    },
  });
  if (!v) notFound();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const totalStock = v.inventoryItems.reduce((s, ii) => s + ii.quantity, 0);

  // Build the Category / Size option lists from the catalog itself, plus the
  // standard set, and ALWAYS include this variant's current value. Otherwise a
  // value outside a hardcoded list would silently reset to "—" and be wiped on
  // save (which is exactly how categories were getting lost after a photo edit).
  const STANDARD_CATEGORIES = ['Pendant', 'Earring', 'Ring', 'Bracelet', 'Necklace', 'Brooch'];
  const STANDARD_SIZES = ['small', 'medium', 'large'];
  const [catRows, sizeRows] = await Promise.all([
    prisma.variant.groupBy({ by: ['category'], where: { category: { not: null } }, orderBy: { category: 'asc' } }),
    prisma.variant.groupBy({ by: ['size'], where: { size: { not: null } }, orderBy: { size: 'asc' } }),
  ]);
  const categoryOptions = Array.from(new Set([...STANDARD_CATEGORIES, ...catRows.map((r) => r.category!), ...(v.category ? [v.category] : [])].filter(Boolean)));
  const sizeOptions = Array.from(new Set([...STANDARD_SIZES, ...sizeRows.map((r) => r.size!), ...(v.size ? [v.size] : [])].filter(Boolean)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackLink fallback="/admin/products" className="btn-link">← Back to products</BackLink>
        <span className="chip">{totalStock} on hand</span>
      </div>
      <header>
        <h1 className="page-title">{v.designName}</h1>
        <p className="page-subtitle font-mono">{v.sku}</p>
      </header>

      <form action={saveAction} className="card space-y-4">
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="designId" value={v.designId} />

        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Photo</legend>
          <ImageUploadField defaultValue={v.imageUrl || ''} cutout />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Design</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Design name (EN)</label>
              <input className="input" name="designName" defaultValue={v.designName} required />
            </div>
            <div>
              <label className="label">Design name (HY, optional)</label>
              <input className="input" name="designNameHy" defaultValue={v.design.nameHy || ''} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" name="category" defaultValue={v.category || ''}>
                <option value="">—</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Collection</label>
              <input className="input" name="collection" defaultValue={v.collection || ''} />
            </div>
            <div>
              <label className="label">Subcollection (e.g. Armenian letter)</label>
              <input className="input" name="subcollection" defaultValue={v.subcollection || ''} />
            </div>
            <div>
              <label className="label">Motif / symbol</label>
              <input className="input" name="motif" defaultValue={v.design.motif || ''} />
            </div>
          </div>
          <div>
            <label className="label">Cultural meaning</label>
            <textarea className="input" name="culturalMeaningEn" rows={2} defaultValue={v.design.culturalMeaningEn || ''} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Variant</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Size</label>
              <select className="input" name="size" defaultValue={v.size || ''}>
                <option value="">—</option>
                {sizeOptions.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Color</label>
              <input className="input" name="color" defaultValue={v.color || ''} />
            </div>
            <div>
              <label className="label">Barcode</label>
              <input className="input" name="barcode" defaultValue={v.barcode || ''} />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Price (AMD)</label>
              <input className="input" name="priceAmd" type="number" step="0.01" defaultValue={Number(v.priceAmd)} required />
            </div>
            <div>
              <label className="label">Weight (g)</label>
              <input className="input" name="weightG" type="number" step="0.001" defaultValue={v.weightG ? Number(v.weightG) : ''} />
            </div>
            <div>
              <label className="label">Reorder point</label>
              <input className="input" name="reorderPoint" type="number" min={0} defaultValue={v.reorderPoint} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-karni-900">Cost breakdown</legend>
          <p className="text-xs text-karni-700 -mt-1">Total cost is the sum of the components below. If you leave the components empty, the manual total is used.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Metal type</label>
              <input className="input" name="metalType" list="metal-types" defaultValue={v.metalType || ''} placeholder="e.g. 925 Silver" />
              <datalist id="metal-types">{METAL_TYPES.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label className="label">Metal cost (AMD)</label>
              <input className="input" name="metalCostAmd" type="number" step="0.01" min="0" defaultValue={v.metalCostAmd ? Number(v.metalCostAmd) : ''} />
            </div>
            <div>
              <label className="label">Filling material (enamel, etc.)</label>
              <input className="input" name="fillingMaterial" list="filling-materials" defaultValue={v.fillingMaterial || ''} placeholder="e.g. Hot / Vitreous enamel" />
              <datalist id="filling-materials">{FILLING_MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label className="label">Filling cost (AMD)</label>
              <input className="input" name="fillingCostAmd" type="number" step="0.01" min="0" defaultValue={v.fillingCostAmd ? Number(v.fillingCostAmd) : ''} />
            </div>
            <div>
              <label className="label">Plating type</label>
              <input className="input" name="platingType" list="plating-types" defaultValue={v.platingType || ''} placeholder="e.g. 24k Gold Plate" />
              <datalist id="plating-types">{PLATING_TYPES.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label className="label">Plating cost (AMD)</label>
              <input className="input" name="platingCostAmd" type="number" step="0.01" min="0" defaultValue={v.platingCostAmd ? Number(v.platingCostAmd) : ''} />
            </div>
            <div>
              <label className="label">Labor cost (AMD)</label>
              <input className="input" name="laborCostAmd" type="number" step="0.01" min="0" defaultValue={v.laborCostAmd ? Number(v.laborCostAmd) : ''} />
            </div>
            <div>
              <label className="label">Manual total cost (AMD) — if no breakdown</label>
              <input className="input" name="costAmd" type="number" step="0.01" min="0" defaultValue={v.costAmd ? Number(v.costAmd) : ''} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" name="status" defaultValue={v.status}>
              <option value="ACTIVE">Active</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
              <option value="COMING_SOON">Coming soon</option>
              <option value="ARCHIVED">Archived (hidden from search)</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-4 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="onWebsite" defaultChecked={v.onWebsite} className="accent-karni-600" /> Website</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="onEtsy" defaultChecked={v.onEtsy} className="accent-karni-600" /> Etsy</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="onIg" defaultChecked={v.onIg} className="accent-karni-600" /> Instagram</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="inStockists" defaultChecked={v.inStockists} className="accent-karni-600" /> Consignment</label>
          </div>
          <label className="flex items-start gap-2 text-sm mt-1">
            <input type="checkbox" name="excludeFromTopSellers" defaultChecked={v.excludeFromTopSellers} className="accent-karni-600 mt-0.5" />
            <span>Exclude from “most sold” reports
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>For default add-ons like the accessory chain bundled with pendants.</span>
            </span>
          </label>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex-1" type="submit">Save changes</button>
          <Link href="/admin/products" className="btn-secondary">Cancel</Link>
        </div>
      </form>

      <section className="card space-y-3">
        <p className="font-semibold">Stock by selling point</p>
        <ul className="space-y-2">
          {sps.map((sp) => {
            const item = v.inventoryItems.find((i) => i.sellingPointId === sp.id);
            const qty = item?.quantity ?? 0;
            return (
              <li key={sp.id} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                <form action={adjustStockAction} className="flex items-center gap-2">
                  <input type="hidden" name="variantId" value={v.id} />
                  <input type="hidden" name="sellingPointId" value={sp.id} />
                  <div className="flex-1">
                    <p className="font-medium">{sp.name}</p>
                    {item?.createdBy && (
                      <p className="text-xs text-karni-700">First checked in by {item.createdBy.fullName} · {item.firstSeenAt.toLocaleDateString()}</p>
                    )}
                  </div>
                  <input className="input w-20" name="newQty" type="number" min={0} defaultValue={qty} />
                  <button className="btn-secondary" type="submit">Set</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <form action={deleteAction} className="card border-red-200 bg-red-50/60">
        <input type="hidden" name="id" value={v.id} />
        <p className="font-semibold text-red-900 mb-1">Delete this product</p>
        <p className="text-sm text-red-800 mb-3">
          {v._count.saleLineItems > 0
            ? <>This variant has <b>{v._count.saleLineItems}</b> sale line(s). It will be <b>archived</b> (hidden from search) instead of hard-deleted so history is preserved.</>
            : <>Hard-deletes the variant (and the design if no other variants remain). Use Archive if you want it kept.</>
          }
        </p>
        <button className="btn-danger" type="submit">{v._count.saleLineItems > 0 ? 'Archive' : 'Delete permanently'}</button>
      </form>
    </div>
  );
}
