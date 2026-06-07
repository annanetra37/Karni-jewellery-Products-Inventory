import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const collection = sp.get('collection') || '';
  const category = sp.get('category') || '';
  const subcollection = sp.get('subcollection') || '';
  const size = sp.get('size') || '';
  const color = sp.get('color') || '';

  const base = { status: { not: 'ARCHIVED' as const } };

  // "Leave one out" facets: each dimension's option list is scoped by all
  // OTHER active filters, so changing one filter narrows every other dropdown
  // to values that actually have matching variants. The dimension being
  // computed is excluded from its own filter set so the user can still
  // switch between its values.
  function where(excluded: 'collection' | 'category' | 'subcollection' | 'size' | 'color') {
    return {
      ...base,
      ...(excluded !== 'collection' && collection ? { collection } : {}),
      ...(excluded !== 'category' && category ? { category } : {}),
      ...(excluded !== 'subcollection' && subcollection ? { subcollection } : {}),
      ...(excluded !== 'size' && size ? { size } : {}),
      ...(excluded !== 'color' && color ? { color } : {}),
    };
  }

  const [cats, sizes, collections, subs, colors] = await Promise.all([
    prisma.variant.findMany({
      where: { ...where('category'), category: { not: null } },
      distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' },
    }),
    prisma.variant.findMany({
      where: { ...where('size'), size: { not: null } },
      distinct: ['size'], select: { size: true }, orderBy: { size: 'asc' },
    }),
    prisma.variant.findMany({
      where: { ...where('collection'), collection: { not: null } },
      distinct: ['collection'], select: { collection: true }, orderBy: { collection: 'asc' },
    }),
    prisma.variant.findMany({
      where: { ...where('subcollection'), subcollection: { not: null } },
      distinct: ['subcollection'], select: { subcollection: true }, orderBy: { subcollection: 'asc' },
    }),
    prisma.variant.findMany({
      where: { ...where('color'), color: { not: null } },
      distinct: ['color'], select: { color: true }, orderBy: { color: 'asc' },
    }),
  ]);

  return NextResponse.json({
    categories: cats.map((c) => c.category).filter(Boolean),
    sizes: sizes.map((s) => s.size).filter(Boolean),
    collections: collections.map((c) => c.collection).filter(Boolean),
    subcollections: subs.map((s) => s.subcollection).filter(Boolean),
    colors: colors.map((c) => c.color).filter(Boolean),
  });
}
