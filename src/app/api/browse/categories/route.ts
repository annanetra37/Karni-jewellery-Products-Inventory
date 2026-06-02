import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const collection = req.nextUrl.searchParams.get('collection') || '';
  const [rows, meta] = await Promise.all([
    prisma.variant.groupBy({
      by: ['category'],
      where: { status: { not: 'ARCHIVED' }, collection, category: { not: null } },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    }),
    prisma.categoryMeta.findMany(),
  ]);
  const photos = new Map(meta.map((m) => [m.name, m.imageUrl]));
  return NextResponse.json({
    items: rows
      .filter((r) => r.category)
      .map((r) => ({ name: r.category!, count: r._count._all, imageUrl: photos.get(r.category!) || null })),
  });
}
