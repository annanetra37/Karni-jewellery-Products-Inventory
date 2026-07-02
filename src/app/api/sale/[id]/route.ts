import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth';
import { DiscountSchema, resolveDiscount } from '@/lib/discount';

const Body = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
  customerId: z.string().nullable().optional(),
  cashToSafe: z.boolean().optional(),
  nonDrawerAmd: z.number().min(0).optional(),
  nonDrawerToSafe: z.boolean().optional(),
  discount: DiscountSchema.nullable().optional(),
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
  if (parsed.data.cashToSafe !== undefined) data.cashToSafe = parsed.data.cashToSafe;
  // Cash-to-safe is meaningless once a sale is no longer cash — clear it.
  if (parsed.data.paymentMethod !== undefined && parsed.data.paymentMethod !== 'CASH') data.cashToSafe = false;

  // A discount change re-resolves against the (fixed) subtotal and re-derives
  // the total. We also need the resulting total to clamp the transfer portion.
  let newTotal: number | null = null;
  if (parsed.data.discount !== undefined || parsed.data.nonDrawerAmd !== undefined) {
    const sale = await prisma.sale.findUnique({ where: { id }, select: { subtotalAmd: true, totalAmd: true } });
    if (!sale) return NextResponse.json({ error: 'sale not found' }, { status: 404 });
    if (parsed.data.discount !== undefined) {
      const subtotal = Number(sale.subtotalAmd);
      const discountAmd = resolveDiscount(subtotal, parsed.data.discount);
      data.discountAmd = discountAmd;
      data.totalAmd = subtotal - discountAmd;
      newTotal = subtotal - discountAmd;
    } else {
      newTotal = Number(sale.totalAmd);
    }
  }

  if (parsed.data.nonDrawerToSafe !== undefined) data.nonDrawerToSafe = parsed.data.nonDrawerToSafe;
  if (parsed.data.nonDrawerAmd !== undefined) {
    // The portion that didn't enter the drawer, capped at the sale total. Kept
    // for any payment method so an admin can record/see it; only cash sales feed
    // the drawer, so it never affects reconciliation for non-cash sales.
    const cap = newTotal ?? Infinity;
    data.nonDrawerAmd = Math.min(Math.max(0, parsed.data.nonDrawerAmd), cap);
  }

  try {
    const sale = await prisma.sale.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: sale.id });
  } catch {
    return NextResponse.json({ error: 'sale not found' }, { status: 404 });
  }
}
