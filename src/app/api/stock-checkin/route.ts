import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const Body = z.object({
  sellingPointId: z.string(),
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
  const { sellingPointId, lines } = parsed.data;

  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      await tx.stockMovement.create({
        data: {
          variantId: l.variantId,
          sellingPointId,
          type: 'CHECKIN',
          qtyDelta: l.quantity,
          performedById: u.id,
          note: l.note || null,
        },
      });
      await tx.inventoryItem.upsert({
        where: { variantId_sellingPointId: { variantId: l.variantId, sellingPointId } },
        create: { variantId: l.variantId, sellingPointId, quantity: l.quantity },
        update: { quantity: { increment: l.quantity } },
      });
    }
  });
  return NextResponse.json({ ok: true });
}
