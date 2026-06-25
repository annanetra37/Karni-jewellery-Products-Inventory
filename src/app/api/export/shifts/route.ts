import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin, sellingPointScope } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatYerevanDateTime, yerevanDateStringStart, YEREVAN_TZ } from '@/lib/datetime';

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: YEREVAN_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const hrs = (ms: number) => Math.max(0, ms / 3_600_000);

/**
 * Shift log CSV (admin only): each cash-drawer session's check-in / check-out
 * and breaks, in Yerevan time. One row per shift. Filter by date range
 * (from/to), selling point and/or user (comma-separated ids) — so a single
 * salesperson or everyone can be exported. Respects the admin's point scope.
 */
export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!isAdmin(u)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const scope = await sellingPointScope(u!);

  const sp = req.nextUrl.searchParams;
  const fromStr = sp.get('from') || '';
  const toStr = sp.get('to') || '';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? yerevanDateStringStart(fromStr) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toStr)
    ? new Date(yerevanDateStringStart(toStr).getTime() + 24 * 60 * 60 * 1000)
    : null;

  const requestedSps = (sp.get('sellingPointId') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const userIds = (sp.get('userId') || '').split(',').map((s) => s.trim()).filter(Boolean);

  // Confine to the admin's scope; intersect with any requested selling points.
  let spWhere: object = {};
  if (scope === null) {
    if (requestedSps.length) spWhere = { sellingPointId: { in: requestedSps } };
  } else {
    const inScope = requestedSps.length ? requestedSps.filter((id) => scope.includes(id)) : scope;
    spWhere = { sellingPointId: { in: inScope.length ? inScope : scope } };
  }

  const shifts = await prisma.cashDrawerSession.findMany({
    where: {
      ...spWhere,
      ...(userIds.length ? { userId: { in: userIds } } : {}),
      ...((from || to) ? { openingAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    },
    orderBy: [{ openingAt: 'asc' }],
    include: {
      user: { select: { fullName: true } },
      sellingPoint: { select: { name: true } },
      breaks: { orderBy: { startedAt: 'asc' }, select: { startedAt: true, endedAt: true } },
    },
  });

  const nowMs = Date.now();
  const header = [
    'Salesperson', 'Selling point', 'Check-in (Yerevan)', 'Check-out (Yerevan)',
    'Hours on shift', 'Breaks', 'Break time (h)', 'Break details (Yerevan)', 'Status',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const s of shifts) {
    const shiftHours = hrs((s.closingAt?.getTime() ?? nowMs) - s.openingAt.getTime());
    const breakHours = s.breaks.reduce((t, b) => t + hrs((b.endedAt?.getTime() ?? nowMs) - b.startedAt.getTime()), 0);
    const breakDetails = s.breaks.map((b) => `${hm.format(b.startedAt)}–${b.endedAt ? hm.format(b.endedAt) : '…'}`).join('; ');
    lines.push([
      s.user.fullName,
      s.sellingPoint.name,
      formatYerevanDateTime(s.openingAt),
      s.closingAt ? formatYerevanDateTime(s.closingAt) : '(open)',
      shiftHours.toFixed(2),
      s.breaks.length,
      breakHours.toFixed(2),
      breakDetails,
      s.status,
    ].map(csvCell).join(','));
  }

  const csv = '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 (Armenian) correctly
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shifts-${stamp}.csv"`,
    },
  });
}
