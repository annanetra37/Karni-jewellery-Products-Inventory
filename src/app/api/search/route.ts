import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

type Row = {
  id: string;
  sku: string;
  designName: string;
  category: string | null;
  collection: string | null;
  subcollection: string | null;
  size: string | null;
  color: string | null;
  priceAmd: string;
  imageUrl: string | null;
  status: string;
  reorderPoint: number;
  quantity: number | null;
};

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const sellingPointId = sp.get('sellingPointId') || '';
  const category = sp.get('category') || '';
  const collection = sp.get('collection') || '';
  const subcollection = sp.get('subcollection') || '';
  const color = sp.get('color') || '';
  const size = sp.get('size') || '';

  // stock filter: all (default) | in | out
  // legacy: inStock=1 means "in"
  let stock = sp.get('stock') || 'all';
  if (sp.get('inStock') === '1') stock = 'in';
  if (!['all', 'in', 'out'].includes(stock)) stock = 'all';

  const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 24)));
  const offset = Math.max(0, Number(sp.get('offset') || 0));

  let rows: Row[];
  let totalRows: { count: bigint }[];

  if (q) {
    const like = `%${q}%`;
    rows = await prisma.$queryRawUnsafe<Row[]>(
      `
      SELECT v.id, v.sku, v."designName", v.category, v.collection, v.subcollection,
             v.size, v.color, v."priceAmd"::text AS "priceAmd", v."imageUrl",
             v.status::text AS status, v."reorderPoint",
             COALESCE(ii.quantity, 0) AS quantity
      FROM "Variant" v
      LEFT JOIN "InventoryItem" ii
        ON ii."variantId" = v.id
       AND ($1 = '' OR ii."sellingPointId" = $1)
      WHERE v.status <> 'ARCHIVED'
        AND ($2 = '' OR v.category = $2)
        AND ($3 = '' OR v.collection = $3)
        AND ($4 = '' OR v.color = $4)
        AND ($5 = '' OR v.size = $5)
        AND ($11 = '' OR v.subcollection = $11)
        AND (v."searchBlob" ILIKE $6 OR similarity(v."searchBlob", $7) > 0.15 OR v.sku ILIKE $6 OR v.barcode = $7)
        AND ($8 = 'all'
             OR ($8 = 'in' AND COALESCE(ii.quantity, 0) > 0)
             OR ($8 = 'out' AND COALESCE(ii.quantity, 0) = 0))
      ORDER BY GREATEST(similarity(v."searchBlob", $7), CASE WHEN v.sku ILIKE $6 THEN 1 ELSE 0 END) DESC,
               v."designName" ASC
      LIMIT $9 OFFSET $10
      `,
      sellingPointId, category, collection, color, size, like, q, stock, limit, offset, subcollection
    );
    totalRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `
      SELECT COUNT(*)::bigint AS count
      FROM "Variant" v
      LEFT JOIN "InventoryItem" ii
        ON ii."variantId" = v.id
       AND ($1 = '' OR ii."sellingPointId" = $1)
      WHERE v.status <> 'ARCHIVED'
        AND ($2 = '' OR v.category = $2)
        AND ($3 = '' OR v.collection = $3)
        AND ($4 = '' OR v.color = $4)
        AND ($5 = '' OR v.size = $5)
        AND ($9 = '' OR v.subcollection = $9)
        AND (v."searchBlob" ILIKE $6 OR similarity(v."searchBlob", $7) > 0.15 OR v.sku ILIKE $6 OR v.barcode = $7)
        AND ($8 = 'all'
             OR ($8 = 'in' AND COALESCE(ii.quantity, 0) > 0)
             OR ($8 = 'out' AND COALESCE(ii.quantity, 0) = 0))
      `,
      sellingPointId, category, collection, color, size, like, q, stock, subcollection
    );
  } else {
    rows = await prisma.$queryRawUnsafe<Row[]>(
      `
      SELECT v.id, v.sku, v."designName", v.category, v.collection, v.subcollection,
             v.size, v.color, v."priceAmd"::text AS "priceAmd", v."imageUrl",
             v.status::text AS status, v."reorderPoint",
             COALESCE(ii.quantity, 0) AS quantity
      FROM "Variant" v
      LEFT JOIN "InventoryItem" ii
        ON ii."variantId" = v.id
       AND ($1 = '' OR ii."sellingPointId" = $1)
      WHERE v.status <> 'ARCHIVED'
        AND ($2 = '' OR v.category = $2)
        AND ($3 = '' OR v.collection = $3)
        AND ($4 = '' OR v.color = $4)
        AND ($5 = '' OR v.size = $5)
        AND ($9 = '' OR v.subcollection = $9)
        AND ($6 = 'all'
             OR ($6 = 'in' AND COALESCE(ii.quantity, 0) > 0)
             OR ($6 = 'out' AND COALESCE(ii.quantity, 0) = 0))
      ORDER BY v."designName" ASC
      LIMIT $7 OFFSET $8
      `,
      sellingPointId, category, collection, color, size, stock, limit, offset, subcollection
    );
    totalRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `
      SELECT COUNT(*)::bigint AS count
      FROM "Variant" v
      LEFT JOIN "InventoryItem" ii
        ON ii."variantId" = v.id
       AND ($1 = '' OR ii."sellingPointId" = $1)
      WHERE v.status <> 'ARCHIVED'
        AND ($2 = '' OR v.category = $2)
        AND ($3 = '' OR v.collection = $3)
        AND ($4 = '' OR v.color = $4)
        AND ($5 = '' OR v.size = $5)
        AND ($7 = '' OR v.subcollection = $7)
        AND ($6 = 'all'
             OR ($6 = 'in' AND COALESCE(ii.quantity, 0) > 0)
             OR ($6 = 'out' AND COALESCE(ii.quantity, 0) = 0))
      `,
      sellingPointId, category, collection, color, size, stock, subcollection
    );
  }

  const total = Number(totalRows[0]?.count ?? 0);
  return NextResponse.json({ results: rows, total, limit, offset });
}
