import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth';

const Body = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
  customerId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!isSuperAdmin(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const data: Prisma.SaleUncheckedUpdateInput = {};
  if (parsed.data.paymentMethod !== undefined) data.paymentMethod = parsed.data.paymentMethod;
  if (parsed.data.customerId !== undefined) data.customerId = parsed.data.customerId || null;

  try {
    const sale = await prisma.sale.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: sale.id });
  } catch {
    return NextResponse.json({ error: 'sale not found' }, { status: 404 });
  }
}
