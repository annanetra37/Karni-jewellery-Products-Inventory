import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const q = (params.get('q') || '').trim();
  const month = Number(params.get('month')) || 0; // 1-12
  const day = Number(params.get('day')) || 0;     // 1-31
  const year = Number(params.get('year')) || 0;
  const hasBirthdayFilter = !!(month || day || year);

  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
          { instagram: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};
  // Birthday parts (month/day/year) can't be expressed in a Prisma `where`, so
  // pull a wider set for the text scope and filter the date parts in memory.
  const rows = await prisma.customer.findMany({
    where,
    take: hasBirthdayFilter ? 1000 : 50,
    orderBy: { createdAt: 'desc' },
  });
  const filtered = hasBirthdayFilter
    ? rows.filter((c) =>
        c.birthday != null
        && (!month || c.birthday.getUTCMonth() + 1 === month)
        && (!day || c.birthday.getUTCDate() === day)
        && (!year || c.birthday.getUTCFullYear() === year))
    : rows;
  return NextResponse.json({ results: filtered.slice(0, 200) });
}

const emptyToNull = z.string().nullable().optional().or(z.literal('').transform(() => null));

const CreateSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  birthday: z.string().min(1),
  address: emptyToNull,
  instagram: emptyToNull,
  gender: emptyToNull,
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { fullName, phone, email, birthday, address, instagram, gender, notes } = parsed.data;
  if (!phone && !email) return NextResponse.json({ error: 'phone or email required' }, { status: 400 });

  // birthday is a required "YYYY-MM-DD" string — parse to a date at UTC midnight.
  const bday = new Date(`${birthday}T00:00:00.000Z`);
  if (Number.isNaN(bday.getTime())) return NextResponse.json({ error: 'invalid birthday' }, { status: 400 });

  const dupe = await prisma.customer.findFirst({
    where: { OR: [phone ? { phone } : undefined, email ? { email } : undefined].filter(Boolean) as object[] },
  });
  if (dupe) {
    return NextResponse.json({ id: dupe.id, warning: 'Existing customer matched by phone/email.', existing: true });
  }
  const c = await prisma.customer.create({
    data: {
      fullName,
      phone: phone || null,
      email: email || null,
      birthday: bday,
      address: address || null,
      instagram: instagram || null,
      gender: gender || null,
      notes,
      createdById: u.id,
    },
  });
  return NextResponse.json(c);
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  birthday: z.string().optional(),
  address: emptyToNull,
  instagram: emptyToNull,
  gender: emptyToNull,
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { id, fullName, phone, email, birthday, address, instagram, gender, notes } = parsed.data;

  // Only touch fields that were actually sent — `undefined` means "leave as is".
  const data: Prisma.CustomerUpdateInput = {};
  if (fullName !== undefined) data.fullName = fullName;
  if (phone !== undefined) data.phone = phone || null;
  if (email !== undefined) data.email = email || null;
  if (address !== undefined) data.address = address || null;
  if (instagram !== undefined) data.instagram = instagram || null;
  if (gender !== undefined) data.gender = gender || null;
  if (notes !== undefined) data.notes = notes || null;
  if (birthday) {
    const bday = new Date(`${birthday}T00:00:00.000Z`);
    if (Number.isNaN(bday.getTime())) return NextResponse.json({ error: 'invalid birthday' }, { status: 400 });
    data.birthday = bday;
  }

  try {
    const c = await prisma.customer.update({ where: { id }, data });
    return NextResponse.json(c);
  } catch {
    return NextResponse.json({ error: 'customer not found' }, { status: 404 });
  }
}
