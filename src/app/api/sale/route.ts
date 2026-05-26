import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { nextNumber, saleNumber } from '@/lib/counter';
import { notify } from '@/lib/notify';

const Body = z.object({
  sellingPointId: z.string(),
  customerId: z.string().nullable().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
  lines: z.array(z.object({
    variantId: z.string(),
    quantity: z.number().int().min(1),
  })).min(1),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { sellingPointId, customerId, paymentMethod, lines } = parsed.data;

  // Reject duplicate variantIds — caller should consolidate first.
  const variantIds = lines.map((l) => l.variantId);
  if (new Set(variantIds).size !== variantIds.length) {
    return NextResponse.json({ error: 'duplicate items — consolidate quantities client-side' }, { status: 400 });
  }

  let saleId = '';
  const lowStockHits: { variantSku: string; remaining: number; sellingPointName: string }[] = [];

  try {
    saleId = await prisma.$transaction(async (tx) => {
      const sp = await tx.sellingPoint.findUnique({ where: { id: sellingPointId } });
      if (!sp) throw new Error('Selling point not found');

      // Lock + validate every line first, before any writes.
      type Prepared = {
        line: typeof lines[number];
        variantId: string;
        sku: string;
        unitPriceAmd: number;
        lineTotalAmd: number;
        newQty: number;
        existingItemId: string | null;
        reorderPoint: number;
      };
      const prepared: Prepared[] = [];
      for (const l of lines) {
        const variant = await tx.variant.findUnique({ where: { id: l.variantId } });
        if (!variant) throw new Error('Variant not found');
        const existing = await tx.inventoryItem.findUnique({
          where: { variantId_sellingPointId: { variantId: l.variantId, sellingPointId } },
        });
        const current = existing?.quantity ?? 0;
        if (current < l.quantity) {
          throw new Error(`Only ${current} left at ${sp.name} for ${variant.sku}.`);
        }
        const unit = Number(variant.priceAmd);
        prepared.push({
          line: l,
          variantId: l.variantId,
          sku: variant.sku,
          unitPriceAmd: unit,
          lineTotalAmd: unit * l.quantity,
          newQty: current - l.quantity,
          existingItemId: existing?.id ?? null,
          reorderPoint: variant.reorderPoint,
        });
      }

      const subtotal = prepared.reduce((s, p) => s + p.lineTotalAmd, 0);
      const n = await nextNumber(tx, 'sale');
      const sNumber = saleNumber(n);

      const sale = await tx.sale.create({
        data: {
          saleNumber: sNumber,
          sellingPointId,
          customerId: customerId || null,
          soldById: u.id,
          subtotalAmd: subtotal,
          totalAmd: subtotal,
          paymentMethod: paymentMethod || 'CASH',
          lineItems: {
            create: prepared.map((p) => ({
              variantId: p.variantId,
              quantity: p.line.quantity,
              unitPriceAmd: p.unitPriceAmd,
              lineTotalAmd: p.lineTotalAmd,
            })),
          },
        },
      });

      for (const p of prepared) {
        await tx.stockMovement.create({
          data: {
            variantId: p.variantId,
            sellingPointId,
            type: 'SALE',
            qtyDelta: -p.line.quantity,
            unitPriceAmd: p.unitPriceAmd,
            performedById: u.id,
            saleId: sale.id,
          },
        });
        if (p.existingItemId) {
          await tx.inventoryItem.update({
            where: { id: p.existingItemId },
            data: { quantity: p.newQty },
          });
        } else {
          await tx.inventoryItem.create({
            data: { variantId: p.variantId, sellingPointId, quantity: p.newQty, createdById: u.id },
          });
        }
        if (p.newQty <= p.reorderPoint) {
          lowStockHits.push({ variantSku: p.sku, remaining: p.newQty, sellingPointName: sp.name });
        }
      }
      return sale.id;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Post-commit notifications, debounced per (sku, location).
  if (lowStockHits.length > 0) {
    const ten = new Date(Date.now() - 10 * 60 * 1000);
    for (const r of lowStockHits) {
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
  }
  return NextResponse.json({ id: saleId });
}
