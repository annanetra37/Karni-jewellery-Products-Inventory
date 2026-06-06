import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const Body = z.object({
  sellingPointId: z.string().min(1),
  variantIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { sellingPointId, variantIds } = parsed.data;

  const items = await prisma.inventoryItem.findMany({
    where: { sellingPointId, variantId: { in: variantIds } },
    select: { variantId: true, quantity: true },
  });
  const stock: Record<string, number> = {};
  for (const id of variantIds) stock[id] = 0;
  for (const it of items) stock[it.variantId] = it.quantity;
  return NextResponse.json({ stock });
}
