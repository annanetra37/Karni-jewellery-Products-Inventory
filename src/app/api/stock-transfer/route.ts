import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, sellingPointScope } from '@/lib/auth';

const Body = z.object({
  variantId: z.string().min(1),
  fromSellingPointId: z.string().min(1),
  toSellingPointId: z.string().min(1),
  quantity: z.number().int().min(1),
  note: z.string().optional(),
});

/**
 * Move stock from one selling point to another. Writes a balancing pair of
 * TRANSFER movements (−qty at the source, +qty at the destination) and updates
 * both InventoryItem rows in one transaction, so on-hand and the ledger stay in
 * sync. This is the proper, logged alternative to editing quantities by hand.
 */
export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { variantId, fromSellingPointId, toSellingPointId, quantity, note } = parsed.data;

  if (fromSellingPointId === toSellingPointId) {
    return NextResponse.json({ error: 'Source and destination must be different.' }, { status: 400 });
  }

  // The seller must be allowed at both ends (admins have unrestricted scope).
  const scope = await sellingPointScope(u);
  if (scope && (!scope.includes(fromSellingPointId) || !scope.includes(toSellingPointId))) {
    return NextResponse.json({ error: 'You do not have access to one of these selling points.' }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const [variant, from, to] = await Promise.all([
        tx.variant.findUnique({ where: { id: variantId } }),
        tx.sellingPoint.findUnique({ where: { id: fromSellingPointId } }),
        tx.sellingPoint.findUnique({ where: { id: toSellingPointId } }),
      ]);
      if (!variant) throw new Error('Item not found');
      if (!from || !to) throw new Error('Selling point not found');

      const source = await tx.inventoryItem.findUnique({
        where: { variantId_sellingPointId: { variantId, sellingPointId: fromSellingPointId } },
      });
      const available = source?.quantity ?? 0;
      if (available < quantity) {
        throw new Error(`Only ${available} in stock for ${variant.sku} at ${from.name}.`);
      }

      // Out of the source.
      await tx.inventoryItem.update({
        where: { variantId_sellingPointId: { variantId, sellingPointId: fromSellingPointId } },
        data: { quantity: { decrement: quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantId, sellingPointId: fromSellingPointId, type: 'TRANSFER', qtyDelta: -quantity,
          performedById: u.id, note: note ? `Transfer to ${to.name}: ${note}` : `Transfer to ${to.name}`,
        },
      });

      // Into the destination.
      await tx.inventoryItem.upsert({
        where: { variantId_sellingPointId: { variantId, sellingPointId: toSellingPointId } },
        create: { variantId, sellingPointId: toSellingPointId, quantity, createdById: u.id },
        update: { quantity: { increment: quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantId, sellingPointId: toSellingPointId, type: 'TRANSFER', qtyDelta: quantity,
          performedById: u.id, note: note ? `Transfer from ${from.name}: ${note}` : `Transfer from ${from.name}`,
        },
      });
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
