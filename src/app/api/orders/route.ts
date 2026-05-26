import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { nextNumber, orderNumber } from '@/lib/counter';
import { notify } from '@/lib/notify';

const Body = z.object({
  customerId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  channel: z.enum(['ONLINE', 'SALES_POINT']),
  sellingPointId: z.string().nullable().optional(),
  lines: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1) })).optional(),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const d = parsed.data;

  const order = await prisma.$transaction(async (tx) => {
    const n = await nextNumber(tx, 'order');
    return tx.order.create({
      data: {
        orderNumber: orderNumber(n),
        createdById: u.id,
        customerId: d.customerId || null,
        customerName: d.customerName || null,
        address: d.address || null,
        note: d.note || null,
        deadline: d.deadline ? new Date(d.deadline) : null,
        channel: d.channel,
        sellingPointId: d.sellingPointId || null,
        lineItems: d.lines && d.lines.length > 0
          ? { create: d.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) }
          : undefined,
      },
    });
  });

  await notify({
    type: 'NEW_ORDER', toAdmins: true,
    title: `New order ${order.orderNumber}`,
    body: `${d.customerName || 'no customer'} · ${d.channel}`,
    relatedId: order.id,
  });
  return NextResponse.json(order);
}
