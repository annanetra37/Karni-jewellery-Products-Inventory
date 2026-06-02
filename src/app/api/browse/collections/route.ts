import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [rows, meta] = await Promise.all([
    prisma.variant.groupBy({
      by: ['collection'],
      where: { status: { not: 'ARCHIVED' }, collection: { not: null } },
      _count: { _all: true },
      orderBy: { collection: 'asc' },
    }),
    prisma.collectionMeta.findMany(),
  ]);
  const photos = new Map(meta.map((m) => [m.name, m.imageUrl]));
  return NextResponse.json({
    items: rows
      .filter((r) => r.collection)
      .map((r) => ({ name: r.collection!, count: r._count._all, imageUrl: photos.get(r.collection!) || null })),
  });
}
