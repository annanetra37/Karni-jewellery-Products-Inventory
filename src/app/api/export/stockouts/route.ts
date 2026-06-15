import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { formatYerevanDateTime, yerevanDateStringStart } from '@/lib/datetime';
import { getProductionList } from '@/lib/production';

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Production worklist CSV (admin only): sale-driven low/out stock + every open
 * order's line items. Mirrors the /admin/production page via getProductionList.
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

  const { stock, orders } = await getProductionList({ from, to });

  const header = ['Type', 'Product', 'SKU', 'Collection', 'Category', 'Location', 'Status', 'Qty', 'Reorder point', 'Date (Yerevan)', 'Deadline (Yerevan)', 'Reference', 'Customer', 'Production details'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of stock) {
    lines.push([
      'Low/out stock', r.product, r.sku, r.collection ?? '', r.category ?? '', r.location,
      r.state, r.qty, r.reorderPoint, formatYerevanDateTime(r.wentAt), '', r.saleNumber, '', '',
    ].map(csvCell).join(','));
  }
  for (const r of orders) {
    lines.push([
      'Order', r.product, r.sku, r.collection ?? '', r.category ?? '', r.location,
      r.status, r.qty, '', formatYerevanDateTime(r.createdAt),
      r.deadline ? formatYerevanDateTime(r.deadline) : '', r.reference, r.customer, r.details,
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
