import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { nextNumber, saleNumber } from '@/lib/counter';
import { notify } from '@/lib/notify';

const Body = z.object({
  variantId: z.string(),
  quantity: z.number().int().min(1),
  sellingPointId: z.string(),
  customerId: z.string().nullable().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { variantId, quantity, sellingPointId, customerId, paymentMethod } = parsed.data;

  let lowStock: { variantSku: string; remaining: number; sellingPointName: string } | null = null;
  let saleId = '';

  try {
    saleId = await prisma.$transaction(async (tx) => {
      const variant = await tx.variant.findUnique({ where: { id: variantId } });
      if (!variant) throw new Error('Variant not found');
      const sp = await tx.sellingPoint.findUnique({ where: { id: sellingPointId } });
      if (!sp) throw new Error('Selling point not found');

      // Lock inventory row (or create at 0).
      const existing = await tx.inventoryItem.findUnique({
        where: { variantId_sellingPointId: { variantId, sellingPointId } },
      });
      const current = existing?.quantity ?? 0;
      if (current < quantity) {
        throw new Error(`Only ${current} left at ${sp.name}.`);
      }
      const newQty = current - quantity;

      const unitPrice = variant.priceAmd;
      const lineTotal = Number(unitPrice) * quantity;

      const n = await nextNumber(tx, 'sale');
      const sNumber = saleNumber(n);

      const sale = await tx.sale.create({
        data: {
          saleNumber: sNumber,
          sellingPointId,
          customerId: customerId || null,
          soldById: u.id,
          subtotalAmd: lineTotal,
          totalAmd: lineTotal,
          paymentMethod: paymentMethod || 'CASH',
          lineItems: {
            create: [{
              variantId, quantity,
              unitPriceAmd: unitPrice,
              lineTotalAmd: lineTotal,
            }],
          },
        },
      });

      await tx.stockMovement.create({
        data: {
          variantId, sellingPointId,
          type: 'SALE',
          qtyDelta: -quantity,
          unitPriceAmd: unitPrice,
          performedById: u.id,
          saleId: sale.id,
        },
      });

      if (existing) {
        await tx.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: newQty },
        });
      } else {
        // Was missing; create at 0 (would have failed earlier if quantity > 0).
        await tx.inventoryItem.create({ data: { variantId, sellingPointId, quantity: 0 } });
      }

      if (newQty <= variant.reorderPoint) {
        lowStock = { variantSku: variant.sku, remaining: newQty, sellingPointName: sp.name };
      }
      return sale.id;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Post-commit notifications (debounced per-sku per location 10 min).
  if (lowStock) {
    const ten = new Date(Date.now() - 10 * 60 * 1000);
    const r = lowStock as { variantSku: string; remaining: number; sellingPointName: string };
    const recent = await prisma.notification.findFirst({
      where: {
        type: 'LOW_STOCK',
        relatedId: r.variantSku,
        body: { contains: r.sellingPointName },
        createdAt: { gte: ten },
      },
    });
    if (!recent) {
      await notify({
        type: 'LOW_STOCK', toAdmins: true,
        title: `Low stock: ${r.variantSku}`,
        body: `${r.remaining} left at ${r.sellingPointName}`,
        relatedId: r.variantSku,
      });
    }
  }
  return NextResponse.json({ id: saleId });
}
