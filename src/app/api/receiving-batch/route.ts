import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, sellingPointScope } from '@/lib/auth';

const Body = z.object({
  sellingPointId: z.string(),
  photoUrls: z.array(z.string().url()).min(1).max(20),
  note: z.string().max(500).optional(),
});

// Save a set of book-page photos on their own (no stock check-in), so a page of
// the owner's list can be captured and dated even before / without adding items.
export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { sellingPointId, photoUrls, note } = parsed.data;

  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(sellingPointId)) {
    return NextResponse.json({ error: 'You do not have access to this selling point.' }, { status: 403 });
  }

  const batch = await prisma.receivingBatch.create({
    data: { sellingPointId, performedById: u.id, photoUrls, note: note || null },
  });
  return NextResponse.json({ ok: true, id: batch.id });
}
