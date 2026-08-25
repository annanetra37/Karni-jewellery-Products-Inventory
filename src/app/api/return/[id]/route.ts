import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth';

const Body = z.object({
  // The drawer session the refund should be attributed to. null detaches it
  // (reconciliation then falls back to matching by time).
  cashSessionId: z.string().nullable(),
});

/**
 * Super-admin re-attribution of a recorded return to the cash drawer session the
 * cash actually moved through. Only the attribution changes — amounts, stock and
 * the linked exchange sale are untouched — but the refund's drawer effect now
 * lands on the chosen shift, clearing a mismatch raised on the wrong one.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !isSuperAdmin(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const ret = await prisma.saleReturn.findUnique({ where: { id }, select: { sellingPointId: true } });
  if (!ret) return NextResponse.json({ error: 'return not found' }, { status: 404 });

  const cashSessionId = parsed.data.cashSessionId;
  if (cashSessionId) {
    const sess = await prisma.cashDrawerSession.findUnique({ where: { id: cashSessionId }, select: { sellingPointId: true } });
    if (!sess || sess.sellingPointId !== ret.sellingPointId) {
      return NextResponse.json({ error: 'That shift does not belong to this selling point.' }, { status: 400 });
    }
  }

  await prisma.saleReturn.update({ where: { id }, data: { cashSessionId } });
  return NextResponse.json({ ok: true });
}
