import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, sellingPointScope } from '@/lib/auth';

const Body = z.object({
  sellingPointId: z.string(),
  // Optional photos of the owner's "ready for Megamall" book pages and a note,
  // captured at receiving time so the received counts can be checked against
  // what was written down.
  photoUrls: z.array(z.string().url()).max(20).optional(),
  batchNote: z.string().max(500).optional(),
  lines: z.array(z.object({
    variantId: z.string(),
    quantity: z.number().int().min(1),
    note: z.string().optional(),
  })).min(1),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { sellingPointId, lines, photoUrls, batchNote } = parsed.data;

  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(sellingPointId)) {
    return NextResponse.json({ error: 'You do not have access to this selling point.' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    // Group this receiving session into a batch so the lines (and any book-page
    // photos) stay together for later comparison.
    const batch = await tx.receivingBatch.create({
      data: {
        sellingPointId,
        performedById: u.id,
        note: batchNote || null,
        photoUrls: photoUrls ?? [],
      },
    });
    for (const l of lines) {
      await tx.stockMovement.create({
        data: {
          variantId: l.variantId,
          sellingPointId,
          type: 'CHECKIN',
          qtyDelta: l.quantity,
          performedById: u.id,
          batchId: batch.id,
          note: l.note || null,
        },
      });
      await tx.inventoryItem.upsert({
        where: { variantId_sellingPointId: { variantId: l.variantId, sellingPointId } },
        create: { variantId: l.variantId, sellingPointId, quantity: l.quantity, createdById: u.id },
        update: { quantity: { increment: l.quantity } },
      });
    }
  });
  return NextResponse.json({ ok: true });
}
