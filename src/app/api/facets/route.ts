import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const base = { status: { not: 'ARCHIVED' as const } };
  const [cats, sizes, collections] = await Promise.all([
    prisma.variant.findMany({
      where: { ...base, category: { not: null } },
      distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' },
    }),
    prisma.variant.findMany({
      where: { ...base, size: { not: null } },
      distinct: ['size'], select: { size: true }, orderBy: { size: 'asc' },
    }),
    prisma.variant.findMany({
      where: { ...base, collection: { not: null } },
      distinct: ['collection'], select: { collection: true }, orderBy: { collection: 'asc' },
    }),
  ]);

  return NextResponse.json({
    categories: cats.map((c) => c.category).filter(Boolean),
    sizes: sizes.map((s) => s.size).filter(Boolean),
    collections: collections.map((c) => c.collection).filter(Boolean),
  });
}
