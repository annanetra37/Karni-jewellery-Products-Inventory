import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};
  const rows = await prisma.customer.findMany({ where, take: 15, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ results: rows });
}

const CreateSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { fullName, phone, email, notes } = parsed.data;
  if (!phone && !email) return NextResponse.json({ error: 'phone or email required' }, { status: 400 });

  const dupe = await prisma.customer.findFirst({
    where: { OR: [phone ? { phone } : undefined, email ? { email } : undefined].filter(Boolean) as object[] },
  });
  if (dupe) {
    return NextResponse.json({ id: dupe.id, warning: 'Existing customer matched by phone/email.', existing: true });
  }
  const c = await prisma.customer.create({
    data: { fullName, phone: phone || null, email: email || null, notes, createdById: u.id },
  });
  return NextResponse.json(c);
}
