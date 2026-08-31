import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { yerevanISODate } from '@/lib/datetime';
import { resolveRange } from '@/lib/dateRange';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Row fill colours (ARGB) by movement kind.
const FILL = {
  green: 'FFC6EFCE',  // drawer → safe
  blue: 'FFBDD7EE',   // POS / other money → safe
  red: 'FFFFC7CE',    // withdrawal · personal
  orange: 'FFFCE0B4', // withdrawal · investment
};

/**
 * Excel export of the Safe "All movements" list, colour-coded per row:
 *  green = drawer→safe, blue = POS (and other non-drawer) money→safe,
 *  red = personal withdrawal, orange = investment withdrawal.
 * Respects the page's date range (range / from / to). Admin only.
 */
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!isAdmin(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const rr = resolveRange({ range: sp.get('range') || undefined, from: sp.get('from') || undefined, to: sp.get('to') || undefined, defaultRange: 'all' });

  const txs = await prisma.safeTransaction.findMany({
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      owner: { select: { fullName: true } },
      sellingPoint: { select: { name: true } },
      performedBy: { select: { fullName: true } },
    },
  });
  const rows = txs.filter((tx) => (!rr.startDate || tx.occurredAt >= rr.startDate) && tx.occurredAt <= rr.endDate);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Safe movements');
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Type', key: 'type', width: 26 },
    { header: 'Source / Owner', key: 'source', width: 24 },
    { header: 'Reason', key: 'reason', width: 12 },
    { header: 'Note', key: 'note', width: 34 },
    { header: 'Recorded by', key: 'by', width: 18 },
    { header: 'Amount (֏)', key: 'amount', width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const tx of rows) {
    const isWithdrawal = tx.type === 'WITHDRAWAL';
    const isBank = tx.type === 'BANK_TO_SAFE';
    const fromDrawer = tx.type === 'DEPOSIT' && tx.fromDrawer;
    const reason = tx.reason === 'INVESTMENT' ? 'Investment' : tx.reason === 'PERSONAL' ? 'Personal' : '';

    const type = isWithdrawal ? 'Withdrawal (from safe)'
      : isBank ? 'POS → Safe'
      : fromDrawer ? 'Drawer → Safe'
      : 'To Safe (not from drawer)';
    const source = isWithdrawal ? (tx.splitAll ? 'Both owners' : (tx.owner?.fullName ?? '—'))
      : isBank ? 'Bank / POS'
      : (tx.sellingPoint?.name ?? '—');
    const amount = (isWithdrawal ? -1 : 1) * Number(tx.amountAmd);

    const row = ws.addRow({
      date: yerevanISODate(tx.occurredAt),
      type, source, reason,
      note: tx.note ?? '',
      by: tx.performedBy.fullName,
      amount,
    });
    row.getCell('amount').numFmt = '#,##0';

    const argb = isWithdrawal
      ? (tx.reason === 'INVESTMENT' ? FILL.orange : FILL.red)   // personal or unset → red
      : fromDrawer ? FILL.green : FILL.blue;                    // BANK_TO_SAFE & other deposits → blue
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    });
  }
  ws.autoFilter = { from: 'A1', to: 'G1' };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="safe-movements-${yerevanISODate(new Date())}.xlsx"`,
    },
  });
}
