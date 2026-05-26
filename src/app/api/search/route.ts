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
  const color = sp.get('color') || '';
  const inStock = sp.get('inStock') === '1';
  const limit = Math.min(50, Number(sp.get('limit') || 25));

  // Use trigram similarity ordering when a query is provided.
  // Fall back to recent-first browse when query is empty.
  let rows: Row[];
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
        AND (v."searchBlob" ILIKE $5 OR similarity(v."searchBlob", $6) > 0.15 OR v.sku ILIKE $5 OR v.barcode = $6)
        AND ($7 = false OR COALESCE(ii.quantity, 0) > 0)
      ORDER BY GREATEST(similarity(v."searchBlob", $6), CASE WHEN v.sku ILIKE $5 THEN 1 ELSE 0 END) DESC,
               v."designName" ASC
      LIMIT $8
      `,
      sellingPointId, category, collection, color, like, q, inStock, limit
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
        AND ($5 = false OR COALESCE(ii.quantity, 0) > 0)
      ORDER BY v."createdAt" DESC
      LIMIT $6
      `,
      sellingPointId, category, collection, color, inStock, limit
    );
  }
  return NextResponse.json({ results: rows });
}
