import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { formatYerevanDateTime, yerevanDateStringStart } from '@/lib/datetime';

type Candidate = {
  variantId: string;
  sellingPointId: string;
  quantity: number;
  designName: string;
  sku: string;
  collection: string | null;
  category: string | null;
  reorderPoint: number;
  sellingPointName: string;
};

type Move = { variantId: string; sellingPointId: string; qtyDelta: number; type: string; createdAt: Date; sale: { saleNumber: string } | null };

type Row = {
  type: string; product: string; sku: string; collection: string; category: string;
  location: string; status: string; qty: number | string; reorderPoint: number | string;
  date: string; deadline: string; reference: string; customer: string; details: string;
};

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Production worklist export (admin only). Two kinds of rows:
 *  1) Low/out stock driven by sales — items currently at/below their reorder
 *     point whose current depleted streak (recent run of movements all at/below
 *     reorder point) contains a sale. This matches the low-stock notifications
 *     and excludes items low/out purely from non-sale moves.
 *  2) Open orders (NEW / IN_PROGRESS) — one row per ordered line item, with the
 *     production specs and deadline, so the workshop sees what to produce.
 */
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!isAdmin(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const fromStr = sp.get('from') || '';
  const toStr = sp.get('to') || '';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? yerevanDateStringStart(fromStr) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toStr)
    ? new Date(yerevanDateStringStart(toStr).getTime() + 24 * 60 * 60 * 1000)
    : null;

  // ---- 1) Sale-driven low/out stock ----------------------------------------
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT ii."variantId", ii."sellingPointId", ii.quantity,
           v."designName", v.sku, v.collection, v.category, v."reorderPoint",
           sp.name AS "sellingPointName"
    FROM "InventoryItem" ii
    JOIN "Variant" v ON v.id = ii."variantId"
    JOIN "SellingPoint" sp ON sp.id = ii."sellingPointId"
    WHERE ii.quantity <= v."reorderPoint"
  `;

  const byPair = new Map<string, Move[]>();
  if (candidates.length > 0) {
    const variantIds = [...new Set(candidates.map((c) => c.variantId))];
    const spIds = [...new Set(candidates.map((c) => c.sellingPointId))];
    const movements = await prisma.stockMovement.findMany({
      where: { variantId: { in: variantIds }, sellingPointId: { in: spIds } },
      orderBy: { createdAt: 'desc' },
      select: { variantId: true, sellingPointId: true, qtyDelta: true, type: true, createdAt: true, sale: { select: { saleNumber: true } } },
    });
    for (const m of movements) {
      const k = `${m.variantId}|${m.sellingPointId}`;
      const arr = byPair.get(k) || [];
      arr.push(m as Move);
      byPair.set(k, arr);
    }
  }

  const stockRows: (Row & { _sort: number })[] = [];
  for (const c of candidates) {
    const isOut = c.quantity <= 0;
    const ms = byPair.get(`${c.variantId}|${c.sellingPointId}`) || []; // newest → oldest
    let running = c.quantity;
    let earliestSale: Move | null = null;
    for (const m of ms) {
      if (running > c.reorderPoint) break; // streak ends (this move left it above reorder)
      if (m.type === 'SALE') earliestSale = m; // keep the oldest sale in the streak
      running -= m.qtyDelta;
    }
    if (!earliestSale) continue; // not driven by a sale
    if (from && earliestSale.createdAt < from) continue;
    if (to && earliestSale.createdAt >= to) continue;
    stockRows.push({
      _sort: earliestSale.createdAt.getTime(),
      type: 'Low/out stock', product: c.designName, sku: c.sku,
      collection: c.collection ?? '', category: c.category ?? '', location: c.sellingPointName,
      status: isOut ? 'OUT' : 'LOW', qty: c.quantity, reorderPoint: c.reorderPoint,
      date: formatYerevanDateTime(earliestSale.createdAt), deadline: '',
      reference: earliestSale.sale?.saleNumber ?? '', customer: '', details: '',
    });
  }
  stockRows.sort((a, b) => b._sort - a._sort);

  // ---- 2) Open orders to produce -------------------------------------------
  const orders = await prisma.order.findMany({
    where: { status: { in: ['NEW', 'IN_PROGRESS'] } },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    include: {
      customer: { select: { fullName: true } },
      sellingPoint: { select: { name: true } },
      lineItems: { include: { variant: { select: { designName: true, sku: true, collection: true, category: true } } } },
    },
  });

  const orderRows: Row[] = [];
  for (const o of orders) {
    for (const li of o.lineItems) {
      const specs = [
        li.metalType && `Metal: ${li.metalType}`,
        li.fillingMaterial && `Filling: ${li.fillingMaterial}`,
        li.platingType && `Plating: ${li.platingType}`,
        li.description,
      ].filter(Boolean).join(' · ');
      orderRows.push({
        type: 'Order',
        product: li.variant?.designName || li.description || '(custom item)',
        sku: li.variant?.sku || '',
        collection: li.variant?.collection ?? '', category: li.variant?.category ?? '',
        location: o.sellingPoint?.name || String(o.channel),
        status: o.status, qty: li.quantity, reorderPoint: '',
        date: formatYerevanDateTime(o.createdAt),
        deadline: o.deadline ? formatYerevanDateTime(o.deadline) : '',
        reference: o.orderNumber,
        customer: o.customerName || o.customer?.fullName || '',
        details: specs,
      });
    }
  }

  return csvResponse([...stockRows, ...orderRows]);
}

function csvResponse(rows: Row[]) {
  const header = ['Type', 'Product', 'SKU', 'Collection', 'Category', 'Location', 'Status', 'Qty', 'Reorder point', 'Date (Yerevan)', 'Deadline (Yerevan)', 'Reference', 'Customer', 'Production details'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.type, r.product, r.sku, r.collection, r.category, r.location, r.status,
      r.qty, r.reorderPoint, r.date, r.deadline, r.reference, r.customer, r.details,
    ].map(csvCell).join(','));
  }
  const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 (Armenian) correctly
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="production-list-${stamp}.csv"`,
    },
  });
}
