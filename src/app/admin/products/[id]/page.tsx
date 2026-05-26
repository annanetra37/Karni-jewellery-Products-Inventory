import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

async function saveAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const priceAmd = Number(formData.get('priceAmd') || 0);
  const costAmd = formData.get('costAmd') ? Number(formData.get('costAmd')) : null;
  const reorderPoint = Number(formData.get('reorderPoint') || 2);
  const imageUrl = String(formData.get('imageUrl') || '') || null;
  const status = String(formData.get('status') || 'ACTIVE') as 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED' | 'COMING_SOON';
  const onWebsite = formData.get('onWebsite') === 'on';
  const onEtsy = formData.get('onEtsy') === 'on';
  const onIg = formData.get('onIg') === 'on';
  const inStockists = formData.get('inStockists') === 'on';

  const fx = await prisma.fxRate.findMany();
  const r: Record<string, number> = {};
  fx.forEach((x) => { r[x.currency] = Number(x.ratePerAmd); });

  await prisma.variant.update({
    where: { id },
    data: {
      priceAmd, costAmd, reorderPoint, imageUrl, status,
      onWebsite, onEtsy, onIg, inStockists,
      priceUsd: r.USD ? priceAmd * r.USD : undefined,
      priceEur: r.EUR ? priceAmd * r.EUR : undefined,
      priceRub: r.RUB ? priceAmd * r.RUB : undefined,
    },
  });
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
    await tx.inventoryItem.upsert({
      where: { variantId_sellingPointId: { variantId, sellingPointId } },
      create: { variantId, sellingPointId, quantity: newQty },
      update: { quantity: newQty },
    });
  });
  revalidatePath(`/admin/products/${variantId}`);
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const v = await prisma.variant.findUnique({
    where: { id },
    include: { inventoryItems: { include: { sellingPoint: true } }, design: true },
  });
  if (!v) notFound();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{v.designName}</h1>
      <p className="text-xs font-mono text-karni-700">{v.sku}</p>

      <form action={saveAction} className="card space-y-3">
        <input type="hidden" name="id" value={v.id} />
        <div>
          <label className="label">Image URL</label>
          <input className="input" name="imageUrl" defaultValue={v.imageUrl || ''} placeholder="https://…/photo.jpg" />
          {v.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.imageUrl} alt="" className="mt-2 rounded-lg max-h-40 object-cover" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Price (AMD)</label>
            <input className="input" name="priceAmd" type="number" step="0.01" defaultValue={Number(v.priceAmd)} required />
          </div>
          <div><label className="label">Cost (AMD)</label>
            <input className="input" name="costAmd" type="number" step="0.01" defaultValue={v.costAmd ? Number(v.costAmd) : ''} />
          </div>
          <div><label className="label">Reorder point</label>
            <input className="input" name="reorderPoint" type="number" min={0} defaultValue={v.reorderPoint} />
          </div>
          <div><label className="label">Status</label>
            <select className="input" name="status" defaultValue={v.status}>
              <option>ACTIVE</option><option>OUT_OF_STOCK</option><option>COMING_SOON</option><option>ARCHIVED</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="onWebsite" defaultChecked={v.onWebsite} /> Website</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="onEtsy" defaultChecked={v.onEtsy} /> Etsy</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="onIg" defaultChecked={v.onIg} /> Instagram</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="inStockists" defaultChecked={v.inStockists} /> Consignment</label>
        </div>
        <button className="btn-primary w-full" type="submit">Save</button>
      </form>

      <section className="card">
        <p className="font-medium mb-2">Stock by selling point</p>
        <ul className="space-y-2">
          {sps.map((sp) => {
            const item = v.inventoryItems.find((i) => i.sellingPointId === sp.id);
            const qty = item?.quantity ?? 0;
            return (
              <li key={sp.id} className="border-b border-karni-100 pb-2">
                <form action={adjustStockAction} className="flex items-center gap-2">
                  <input type="hidden" name="variantId" value={v.id} />
                  <input type="hidden" name="sellingPointId" value={sp.id} />
                  <span className="flex-1">{sp.name}</span>
                  <input className="input w-20" name="newQty" type="number" min={0} defaultValue={qty} />
                  <button className="btn-secondary px-3 py-2" type="submit">Set</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
