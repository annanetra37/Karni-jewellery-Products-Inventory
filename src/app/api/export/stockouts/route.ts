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

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export the products that are currently low or out of stock *because a sale
 * pushed them there* — not every low/out item. We anchor to each item's current
 * quantity and walk its stock movements backwards to find the movement that
 * crossed it into its current state; only rows whose crossing movement is a
 * SALE are kept, tagged with the date it happened.
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

  // Items currently at or below their reorder point (covers low AND out).
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT ii."variantId", ii."sellingPointId", ii.quantity,
           v."designName", v.sku, v.collection, v.category, v."reorderPoint",
           sp.name AS "sellingPointName"
    FROM "InventoryItem" ii
    JOIN "Variant" v ON v.id = ii."variantId"
    JOIN "SellingPoint" sp ON sp.id = ii."sellingPointId"
    WHERE ii.quantity <= v."reorderPoint"
  `;

  if (candidates.length === 0) {
    return csvResponse([]);
  }

  const variantIds = [...new Set(candidates.map((c) => c.variantId))];
  const spIds = [...new Set(candidates.map((c) => c.sellingPointId))];
  const movements = await prisma.stockMovement.findMany({
    where: { variantId: { in: variantIds }, sellingPointId: { in: spIds } },
    orderBy: { createdAt: 'desc' },
    select: { variantId: true, sellingPointId: true, qtyDelta: true, type: true, createdAt: true, sale: { select: { saleNumber: true } } },
  });
  const byPair = new Map<string, Move[]>();
  for (const m of movements) {
    const k = `${m.variantId}|${m.sellingPointId}`;
    const arr = byPair.get(k) || [];
    arr.push(m as Move);
    byPair.set(k, arr);
  }

  type Row = Candidate & { state: 'OUT' | 'LOW'; wentAt: Date; saleNumber: string };
  const rows: Row[] = [];

  for (const c of candidates) {
    const isOut = c.quantity <= 0;
    const ms = byPair.get(`${c.variantId}|${c.sellingPointId}`) || []; // newest → oldest
    // Walk back over the item's CURRENT depleted streak — the unbroken run of
    // recent movements that each left it at/below the reorder point — and find
    // the earliest sale in it. This matches the low-stock notification, which
    // fires whenever a sale leaves the quantity at/below the reorder point
    // (including items that were received already low and then sold). It only
    // excludes items driven low purely by non-sale moves (received low and
    // never sold, manual adjustments, transfers, damage).
    let running = c.quantity; // post-quantity of the current (newest) movement
    let earliestSale: Move | null = null;
    for (const m of ms) {
      if (running > c.reorderPoint) break; // this move left it above reorder → streak ends
      if (m.type === 'SALE') earliestSale = m; // keep the oldest sale seen so far
      running -= m.qtyDelta; // step to the previous movement's post-quantity
    }
    if (!earliestSale) continue; // current low/out state not driven by a sale
    if (from && earliestSale.createdAt < from) continue;
    if (to && earliestSale.createdAt >= to) continue;
    rows.push({ ...c, state: isOut ? 'OUT' : 'LOW', wentAt: earliestSale.createdAt, saleNumber: earliestSale.sale?.saleNumber ?? '' });
  }

  rows.sort((a, b) => b.wentAt.getTime() - a.wentAt.getTime());
  return csvResponse(rows);
}

function csvResponse(rows: { designName: string; sku: string; collection: string | null; category: string | null; sellingPointName: string; state: string; quantity: number; reorderPoint: number; wentAt: Date; saleNumber: string }[]) {
  const header = ['Product', 'SKU', 'Collection', 'Category', 'Selling point', 'State', 'Current qty', 'Reorder point', 'Went low/out at (Yerevan)', 'Caused by sale'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.designName, r.sku, r.collection ?? '', r.category ?? '', r.sellingPointName,
      r.state, r.quantity, r.reorderPoint, formatYerevanDateTime(r.wentAt), r.saleNumber,
    ].map(csvCell).join(','));
  }
  const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 (Armenian) correctly
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sale-driven-stockouts-${stamp}.csv"`,
    },
  });
}
