import { prisma } from './db';

/**
 * Read-only integrity checks over the live database. Each check asserts an
 * invariant that must always hold if the app's write paths are correct, and
 * reports the rows that violate it. Nothing here mutates data, so it is safe to
 * run against production at any time (admin page or `npm run health`).
 *
 * The cornerstone invariant: every change to InventoryItem.quantity is written
 * together with a StockMovement carrying the same delta, in one transaction. So
 * for every (variant, selling point), quantity must equal the sum of its
 * movements. If a sale, check-in or adjustment ever failed to update stock, the
 * two would disagree and the first check would catch it.
 */
export type HealthCheck = {
  id: string;
  label: string;
  /** What this proves, in plain language. */
  proves: string;
  ok: boolean;
  failCount: number;
  /** A few human-readable offending rows, for diagnosis. */
  samples: string[];
};

const LIMIT = 20;

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const [
    ledger,
    negative,
    lineMath,
    saleTotals,
    saleUnits,
    cashMath,
  ] = await Promise.all([
    // 1. Inventory == movement ledger, for every (variant, point) on either side.
    prisma.$queryRawUnsafe<{ sku: string; point: string; qty: number; ledger: number }[]>(`
      WITH ledger AS (
        SELECT "variantId", "sellingPointId", SUM("qtyDelta")::int AS delta
        FROM "StockMovement" GROUP BY 1, 2
      )
      SELECT v.sku, sp.name AS point,
             COALESCE(ii.quantity, 0) AS qty, COALESCE(l.delta, 0) AS ledger
      FROM "InventoryItem" ii
      FULL OUTER JOIN ledger l
        ON l."variantId" = ii."variantId" AND l."sellingPointId" = ii."sellingPointId"
      JOIN "Variant" v ON v.id = COALESCE(ii."variantId", l."variantId")
      JOIN "SellingPoint" sp ON sp.id = COALESCE(ii."sellingPointId", l."sellingPointId")
      WHERE COALESCE(ii.quantity, 0) <> COALESCE(l.delta, 0)
      LIMIT ${LIMIT}
    `),
    // 2. No stock has gone negative.
    prisma.$queryRawUnsafe<{ sku: string; point: string; qty: number }[]>(`
      SELECT v.sku, sp.name AS point, ii.quantity AS qty
      FROM "InventoryItem" ii
      JOIN "Variant" v ON v.id = ii."variantId"
      JOIN "SellingPoint" sp ON sp.id = ii."sellingPointId"
      WHERE ii.quantity < 0
      LIMIT ${LIMIT}
    `),
    // 3. Each sale line: lineTotal = quantity * unitPrice.
    prisma.$queryRawUnsafe<{ saleNumber: string; line: string }[]>(`
      SELECT s."saleNumber",
             (li.quantity || ' x ' || li."unitPriceAmd" || ' <> ' || li."lineTotalAmd") AS line
      FROM "SaleLineItem" li
      JOIN "Sale" s ON s.id = li."saleId"
      WHERE li."lineTotalAmd" <> li.quantity * li."unitPriceAmd"
      LIMIT ${LIMIT}
    `),
    // 4. Each sale: subtotal = sum(lines) and total = subtotal - discount.
    prisma.$queryRawUnsafe<{ saleNumber: string; detail: string }[]>(`
      SELECT s."saleNumber",
             ('subtotal ' || s."subtotalAmd" || ', lines ' || COALESCE(agg.sum, 0)
              || ', total ' || s."totalAmd" || ', discount ' || s."discountAmd") AS detail
      FROM "Sale" s
      LEFT JOIN (SELECT "saleId", SUM("lineTotalAmd") AS sum FROM "SaleLineItem" GROUP BY 1) agg
        ON agg."saleId" = s.id
      WHERE s."subtotalAmd" <> COALESCE(agg.sum, 0)
         OR s."totalAmd" <> s."subtotalAmd" - s."discountAmd"
      LIMIT ${LIMIT}
    `),
    // 5. Every sold unit left inventory: SALE movements per sale = units sold.
    prisma.$queryRawUnsafe<{ saleNumber: string; detail: string }[]>(`
      SELECT s."saleNumber",
             ('sold ' || li.units || ', removed from stock ' || COALESCE(mv.units, 0)) AS detail
      FROM "Sale" s
      JOIN (SELECT "saleId", SUM(quantity)::int AS units FROM "SaleLineItem" GROUP BY 1) li
        ON li."saleId" = s.id
      LEFT JOIN (SELECT "saleId", -SUM("qtyDelta")::int AS units FROM "StockMovement"
                 WHERE type = 'SALE' GROUP BY 1) mv ON mv."saleId" = s.id
      WHERE COALESCE(mv.units, 0) <> li.units
      LIMIT ${LIMIT}
    `),
    // 6. Cash discrepancy math on closed shifts: diff = counted - expected.
    prisma.$queryRawUnsafe<{ id: string; detail: string }[]>(`
      SELECT id,
             ('counted ' || "closingCountAmd" || ', expected ' || "expectedClosingAmd"
              || ', recorded diff ' || "discrepancyAmd") AS detail
      FROM "CashDrawerSession"
      WHERE status = 'CLOSED'
        AND "closingCountAmd" IS NOT NULL AND "expectedClosingAmd" IS NOT NULL
        AND "discrepancyAmd" IS DISTINCT FROM ("closingCountAmd" - "expectedClosingAmd")
      LIMIT ${LIMIT}
    `),
  ]);

  return [
    {
      id: 'inventory-ledger',
      label: 'Inventory matches the stock ledger',
      proves: 'Every sale, check-in and adjustment correctly changed on-hand stock — quantity equals the sum of all movements.',
      ok: ledger.length === 0,
      failCount: ledger.length,
      samples: ledger.map((r) => `${r.sku} @ ${r.point}: on-hand ${r.qty}, ledger says ${r.ledger}`),
    },
    {
      id: 'no-negative-stock',
      label: 'No negative stock',
      proves: 'No item was ever oversold below zero.',
      ok: negative.length === 0,
      failCount: negative.length,
      samples: negative.map((r) => `${r.sku} @ ${r.point}: ${r.qty}`),
    },
    {
      id: 'sale-line-math',
      label: 'Sale line totals are correct',
      proves: 'Each line total equals quantity × unit price.',
      ok: lineMath.length === 0,
      failCount: lineMath.length,
      samples: lineMath.map((r) => `${r.saleNumber}: ${r.line}`),
    },
    {
      id: 'sale-totals',
      label: 'Sale totals reconcile',
      proves: 'Each sale subtotal equals its lines, and total equals subtotal minus discount.',
      ok: saleTotals.length === 0,
      failCount: saleTotals.length,
      samples: saleTotals.map((r) => `${r.saleNumber}: ${r.detail}`),
    },
    {
      id: 'sale-units-removed',
      label: 'Every sold unit left inventory',
      proves: 'The units removed from stock for each sale match the units on the receipt.',
      ok: saleUnits.length === 0,
      failCount: saleUnits.length,
      samples: saleUnits.map((r) => `${r.saleNumber}: ${r.detail}`),
    },
    {
      id: 'cash-discrepancy-math',
      label: 'Cash discrepancies add up',
      proves: 'Every closed shift’s recorded discrepancy equals counted minus expected cash.',
      ok: cashMath.length === 0,
      failCount: cashMath.length,
      samples: cashMath.map((r) => `session ${r.id}: ${r.detail}`),
    },
  ];
}
