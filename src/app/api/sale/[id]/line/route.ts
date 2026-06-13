import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth';

const Body = z.object({
  lineItemId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
});

/**
 * Super-admin correction of a recorded sale line: swap the sold item and/or
 * change the quantity. Inventory is made whole — the originally sold item is
 * returned to stock and the corrected item is deducted — and the sale's
 * subtotal/total (keeping any discount) are recomputed.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isSuperAdmin(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id: saleId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { lineItemId, variantId, quantity } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId } });
      if (!sale) throw new Error('sale not found');
      const line = await tx.saleLineItem.findUnique({ where: { id: lineItemId }, include: { variant: true } });
      if (!line || line.saleId !== saleId) throw new Error('line item not found');

      const sellingPointId = sale.sellingPointId;
      const oldVariantId = line.variantId;
      const oldQty = line.quantity;
      const newVariantId = variantId ?? oldVariantId;
      const newQty = quantity ?? oldQty;
      const variantChanged = newVariantId !== oldVariantId;

      if (!variantChanged && newQty === oldQty) return; // nothing to do

      const newVariant = variantChanged
        ? await tx.variant.findUnique({ where: { id: newVariantId } })
        : line.variant;
      if (!newVariant) throw new Error('selected item not found');
      const sp = await tx.sellingPoint.findUnique({ where: { id: sellingPointId } });

      // 1) Return the originally sold item to stock.
      await tx.inventoryItem.upsert({
        where: { variantId_sellingPointId: { variantId: oldVariantId, sellingPointId } },
        create: { variantId: oldVariantId, sellingPointId, quantity: oldQty, createdById: u.id },
        update: { quantity: { increment: oldQty } },
      });
      await tx.stockMovement.create({
        data: {
          variantId: oldVariantId, sellingPointId, type: 'RETURN', qtyDelta: oldQty,
          performedById: u.id, saleId, note: 'Sale correction — item returned',
        },
      });

      // 2) Deduct the corrected item (availability now includes any return above).
      const newInv = await tx.inventoryItem.findUnique({
        where: { variantId_sellingPointId: { variantId: newVariantId, sellingPointId } },
      });
      const available = newInv?.quantity ?? 0;
      if (available < newQty) {
        throw new Error(`Only ${available} in stock for ${newVariant.sku}${sp ? ` at ${sp.name}` : ''}.`);
      }
      await tx.inventoryItem.update({
        where: { variantId_sellingPointId: { variantId: newVariantId, sellingPointId } },
        data: { quantity: { decrement: newQty } },
      });
      await tx.stockMovement.create({
        data: {
          variantId: newVariantId, sellingPointId, type: 'SALE', qtyDelta: -newQty,
          unitPriceAmd: newVariant.priceAmd, performedById: u.id, saleId, note: 'Sale correction — item sold',
        },
      });

      // 3) Update the line. A swapped item takes the new item's price; a pure
      //    quantity change keeps the price it was actually sold at.
      const unitPrice = variantChanged ? Number(newVariant.priceAmd) : Number(line.unitPriceAmd);
      await tx.saleLineItem.update({
        where: { id: lineItemId },
        data: { variantId: newVariantId, quantity: newQty, unitPriceAmd: unitPrice, lineTotalAmd: unitPrice * newQty },
      });

      // 4) Recompute the sale's subtotal/total, keeping the discount (clamped).
      const agg = await tx.saleLineItem.aggregate({ where: { saleId }, _sum: { lineTotalAmd: true } });
      const subtotal = Number(agg._sum.lineTotalAmd ?? 0);
      const discountAmd = Math.min(Number(sale.discountAmd), subtotal);
      await tx.sale.update({
        where: { id: saleId },
        data: { subtotalAmd: subtotal, discountAmd, totalAmd: subtotal - discountAmd },
      });
    });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'sale not found' || msg === 'line item not found' ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json({ ok: true });
}
