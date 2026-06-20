import { prisma } from './db';

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

export type StockRow = {
  product: string; sku: string; collection: string | null; category: string | null;
  location: string; state: 'OUT' | 'LOW'; qty: number; reorderPoint: number;
  wentAt: Date; saleNumber: string;
};
export type OrderRow = {
  product: string; sku: string; collection: string | null; category: string | null;
  location: string; status: string; qty: number; deadline: Date | null; createdAt: Date;
  reference: string; customer: string; details: string; note: string;
};

/**
 * The production worklist: (1) items currently low/out *because of a sale* and
 * (2) every open order's line items. Shared by the portal page and the CSV
 * export so both always agree. `from`/`to` bound the stock rows' "went low/out"
 * date; open orders are always included in full.
 */
export async function getProductionList(opts: { from?: Date | null; to?: Date | null } = {}): Promise<{ stock: StockRow[]; orders: OrderRow[] }> {
  const from = opts.from ?? null;
  const to = opts.to ?? null;

  // ---- Sale-driven low/out stock -------------------------------------------
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

  const stock: StockRow[] = [];
  for (const c of candidates) {
    const isOut = c.quantity <= 0;
    const ms = byPair.get(`${c.variantId}|${c.sellingPointId}`) || []; // newest → oldest
    // The "went" date must match the row's current state: for an OUT item we
    // want the sale that took it to zero, not the older one that first dropped
    // it to "low". Walk back only through the contiguous run that stayed within
    // the relevant threshold (0 for out, reorder point for low).
    const threshold = isOut ? 0 : c.reorderPoint;
    let running = c.quantity;
    let earliestSale: Move | null = null;
    for (const m of ms) {
      if (running > threshold) break;
      if (m.type === 'SALE') earliestSale = m;
      running -= m.qtyDelta;
    }
    if (!earliestSale) continue;
    if (from && earliestSale.createdAt < from) continue;
    if (to && earliestSale.createdAt >= to) continue;
    stock.push({
      product: c.designName, sku: c.sku, collection: c.collection, category: c.category,
      location: c.sellingPointName, state: isOut ? 'OUT' : 'LOW', qty: c.quantity,
      reorderPoint: c.reorderPoint, wentAt: earliestSale.createdAt, saleNumber: earliestSale.sale?.saleNumber ?? '',
    });
  }
  stock.sort((a, b) => b.wentAt.getTime() - a.wentAt.getTime());

  // ---- Open orders to produce ----------------------------------------------
  // Everything not finished: NEW, IN_PROGRESS and READY (exclude FULFILLED /
  // CANCELLED). The workshop sees the full active pipeline.
  const orders = await prisma.order.findMany({
    where: { status: { in: ['NEW', 'IN_PROGRESS', 'READY'] } },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    include: {
      customer: { select: { fullName: true } },
      sellingPoint: { select: { name: true } },
      lineItems: { include: { variant: { select: { designName: true, sku: true, collection: true, category: true } } } },
    },
  });

  const orderRows: OrderRow[] = [];
  for (const o of orders) {
    const customer = o.customerName || o.customer?.fullName || '';
    const location = o.sellingPoint?.name || String(o.channel);
    // An order can be created with no structured line items (just a note /
    // custom request). Still surface it as one row so the workshop sees it.
    if (o.lineItems.length === 0) {
      orderRows.push({
        product: '(no items listed — see notes)', sku: '', collection: null, category: null,
        location, status: o.status, qty: 0, deadline: o.deadline, createdAt: o.createdAt,
        reference: o.orderNumber, customer, details: '', note: o.note ?? '',
      });
      continue;
    }
    for (const li of o.lineItems) {
      const details = [
        li.metalType && `Metal: ${li.metalType}`,
        li.fillingMaterial && `Filling: ${li.fillingMaterial}`,
        li.platingType && `Plating: ${li.platingType}`,
        li.description,
      ].filter(Boolean).join(' · ');
      orderRows.push({
        product: li.variant?.designName || li.description || '(custom item)',
        sku: li.variant?.sku || '',
        collection: li.variant?.collection ?? null, category: li.variant?.category ?? null,
        location,
        status: o.status, qty: li.quantity, deadline: o.deadline, createdAt: o.createdAt,
        reference: o.orderNumber, customer, details,
        note: o.note ?? '',
      });
    }
  }

  return { stock, orders: orderRows };
}
