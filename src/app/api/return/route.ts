import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, sellingPointScope } from '@/lib/auth';
import { nextNumber, saleNumber, returnNumber } from '@/lib/counter';
import { notify } from '@/lib/notify';
import { formatAmd } from '@/lib/currency';

const Body = z.object({
  sellingPointId: z.string(),
  customerId: z.string().nullable().optional(),
  originalSaleId: z.string().nullable().optional(),
  // Was the credit handed back to the customer in cash from the drawer?
  refundFromDrawer: z.boolean().optional(),
  // Which cash drawer session the refund/top-up passed through. Defaults to the
  // selling point's current open shift. Pass null to record it untied to a
  // drawer (reconciliation then matches by time).
  cashSessionId: z.string().nullable().optional(),
  // How the new (exchange) items are paid for, if any are taken.
  exchangePaymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
  note: z.string().max(500).optional(),
  // Items coming back into stock. Unit price = credit given per unit (defaults
  // to the variant's catalogue price if omitted).
  returnedLines: z.array(z.object({
    variantId: z.string(),
    quantity: z.number().int().min(1),
    unitPriceAmd: z.number().min(0).optional(),
  })).min(1),
  // New pieces taken in exchange (priced at the current catalogue price).
  exchangeLines: z.array(z.object({
    variantId: z.string(),
    quantity: z.number().int().min(1),
  })).default([]),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { sellingPointId, customerId, originalSaleId, note, returnedLines, exchangeLines } = parsed.data;
  const refundFromDrawer = parsed.data.refundFromDrawer ?? true;
  const exchangePaymentMethod = parsed.data.exchangePaymentMethod ?? 'CASH';

  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(sellingPointId)) {
    return NextResponse.json({ error: 'You do not have access to this selling point.' }, { status: 403 });
  }

  // No duplicate variants within either list — caller consolidates quantities.
  const retIds = returnedLines.map((l) => l.variantId);
  if (new Set(retIds).size !== retIds.length) {
    return NextResponse.json({ error: 'duplicate returned items — consolidate quantities client-side' }, { status: 400 });
  }
  const exIds = exchangeLines.map((l) => l.variantId);
  if (new Set(exIds).size !== exIds.length) {
    return NextResponse.json({ error: 'duplicate exchange items — consolidate quantities client-side' }, { status: 400 });
  }

  let result: { returnId: string; returnNumber: string; returnedAmd: number; exchangeAmd: number; exchangeSaleId: string | null } | null = null;
  const lowStockHits: { variantSku: string; remaining: number; sellingPointName: string }[] = [];

  try {
    result = await prisma.$transaction(async (tx) => {
      const sp = await tx.sellingPoint.findUnique({ where: { id: sellingPointId } });
      if (!sp) throw new Error('Selling point not found');

      // ---- Returned items: validate + price the credit. ----
      const returnPrepared: { variantId: string; quantity: number; unitPriceAmd: number; lineTotalAmd: number }[] = [];
      for (const l of returnedLines) {
        const variant = await tx.variant.findUnique({ where: { id: l.variantId } });
        if (!variant) throw new Error('Returned item not found');
        const unit = l.unitPriceAmd ?? Number(variant.priceAmd);
        returnPrepared.push({
          variantId: l.variantId, quantity: l.quantity,
          unitPriceAmd: unit, lineTotalAmd: unit * l.quantity,
        });
      }
      const returnedAmd = returnPrepared.reduce((s, p) => s + p.lineTotalAmd, 0);

      // ---- Exchange items: validate stock + price at catalogue. ----
      const exchangePrepared: {
        variantId: string; sku: string; quantity: number; unitPriceAmd: number; lineTotalAmd: number;
        newQty: number; existingItemId: string | null; reorderPoint: number;
      }[] = [];
      for (const l of exchangeLines) {
        const variant = await tx.variant.findUnique({ where: { id: l.variantId } });
        if (!variant) throw new Error('Exchange item not found');
        const existing = await tx.inventoryItem.findUnique({
          where: { variantId_sellingPointId: { variantId: l.variantId, sellingPointId } },
        });
        const current = existing?.quantity ?? 0;
        if (current < l.quantity) throw new Error(`Only ${current} left at ${sp.name} for ${variant.sku}.`);
        const unit = Number(variant.priceAmd);
        exchangePrepared.push({
          variantId: l.variantId, sku: variant.sku, quantity: l.quantity,
          unitPriceAmd: unit, lineTotalAmd: unit * l.quantity,
          newQty: current - l.quantity, existingItemId: existing?.id ?? null, reorderPoint: variant.reorderPoint,
        });
      }
      const exchangeAmd = exchangePrepared.reduce((s, p) => s + p.lineTotalAmd, 0);
      let exchangeSaleId: string | null = null;

      // Signed net cash the drawer sees: customer pays the difference in cash
      // (positive) or is refunded the difference from the drawer (negative).
      // Card/transfer top-ups and non-drawer refunds don't move the drawer.
      const net = exchangeAmd - returnedAmd;
      const drawerDeltaAmd = net >= 0
        ? (exchangePaymentMethod === 'CASH' ? net : 0)
        : (refundFromDrawer ? net : 0);

      // Which drawer the cash moves through. Default to the point's open shift;
      // an explicit value (including a closed shift) is honoured, null detaches
      // it from any drawer.
      let cashSessionId: string | null;
      if (parsed.data.cashSessionId === undefined) {
        const open = await tx.cashDrawerSession.findFirst({
          where: { sellingPointId, status: 'OPEN' }, orderBy: { openingAt: 'desc' }, select: { id: true },
        });
        cashSessionId = open?.id ?? null;
      } else {
        cashSessionId = parsed.data.cashSessionId;
        if (cashSessionId) {
          const sess = await tx.cashDrawerSession.findUnique({ where: { id: cashSessionId }, select: { sellingPointId: true } });
          if (!sess || sess.sellingPointId !== sellingPointId) throw new Error('That shift does not belong to this selling point.');
        }
      }

      // ---- Create the return record. ----
      const rNum = returnNumber(await nextNumber(tx, 'return'));
      const saleReturn = await tx.saleReturn.create({
        data: {
          returnNumber: rNum,
          sellingPointId,
          customerId: customerId || null,
          performedById: u.id,
          originalSaleId: originalSaleId || null,
          cashSessionId,
          returnedAmd,
          exchangeAmd,
          drawerDeltaAmd,
          refundFromDrawer,
          note: note || null,
          lineItems: {
            create: returnPrepared.map((p) => ({
              variantId: p.variantId, quantity: p.quantity,
              unitPriceAmd: p.unitPriceAmd, lineTotalAmd: p.lineTotalAmd,
            })),
          },
        },
      });

      // ---- Restock returned goods (RETURN movements). ----
      for (const p of returnPrepared) {
        await tx.inventoryItem.upsert({
          where: { variantId_sellingPointId: { variantId: p.variantId, sellingPointId } },
          create: { variantId: p.variantId, sellingPointId, quantity: p.quantity, createdById: u.id },
          update: { quantity: { increment: p.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            variantId: p.variantId, sellingPointId, type: 'RETURN', qtyDelta: p.quantity,
            unitPriceAmd: p.unitPriceAmd, performedById: u.id, returnId: saleReturn.id,
            note: `Return ${rNum}`,
          },
        });
      }

      // ---- Exchange purchase: a normal linked Sale for the new pieces. ----
      if (exchangePrepared.length > 0) {
        const sNum = saleNumber(await nextNumber(tx, 'sale'));
        const exchangeSale = await tx.sale.create({
          data: {
            saleNumber: sNum,
            sellingPointId,
            customerId: customerId || null,
            soldById: u.id,
            subtotalAmd: exchangeAmd,
            discountAmd: 0,
            totalAmd: exchangeAmd,
            paymentMethod: exchangePaymentMethod,
            cashToSafe: false,
            nonDrawerAmd: 0,
            nonDrawerToSafe: false,
            lineItems: {
              create: exchangePrepared.map((p) => ({
                variantId: p.variantId, quantity: p.quantity,
                unitPriceAmd: p.unitPriceAmd, lineTotalAmd: p.lineTotalAmd,
              })),
            },
          },
        });
        await tx.saleReturn.update({ where: { id: saleReturn.id }, data: { exchangeSaleId: exchangeSale.id } });
        exchangeSaleId = exchangeSale.id;

        for (const p of exchangePrepared) {
          await tx.stockMovement.create({
            data: {
              variantId: p.variantId, sellingPointId, type: 'SALE', qtyDelta: -p.quantity,
              unitPriceAmd: p.unitPriceAmd, performedById: u.id, saleId: exchangeSale.id, returnId: saleReturn.id,
              note: `Exchange ${rNum}`,
            },
          });
          if (p.existingItemId) {
            await tx.inventoryItem.update({ where: { id: p.existingItemId }, data: { quantity: p.newQty } });
          } else {
            await tx.inventoryItem.create({ data: { variantId: p.variantId, sellingPointId, quantity: p.newQty, createdById: u.id } });
          }
          if (p.newQty <= p.reorderPoint) {
            lowStockHits.push({ variantSku: p.sku, remaining: p.newQty, sellingPointName: sp.name });
          }
        }
      }

      return { returnId: saleReturn.id, returnNumber: rNum, returnedAmd, exchangeAmd, exchangeSaleId };
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Post-commit low-stock alerts for any exchanged-out items.
  if (lowStockHits.length > 0) {
    const ten = new Date(Date.now() - 10 * 60 * 1000);
    for (const r of lowStockHits) {
      const title = `${r.remaining <= 0 ? 'Out of stock' : 'Low stock'}: ${r.variantSku}`;
      const body = `${r.remaining} left at ${r.sellingPointName}`;
      const recent = await prisma.notification.findFirst({
        where: { type: 'LOW_STOCK', relatedId: r.variantSku, body: { contains: r.sellingPointName }, createdAt: { gte: ten } },
        orderBy: { createdAt: 'desc' },
      });
      if (recent) {
        await prisma.notification.update({ where: { id: recent.id }, data: { title, body, readBy: [], createdAt: new Date() } });
      } else {
        await notify({ type: 'LOW_STOCK', toAdmins: true, title, body, relatedId: r.variantSku });
      }
    }
  }

  // Notify admins of the return for visibility (the drawer cash impact differs
  // from a normal sale).
  try {
    const r = result!;
    const netCashOut = r.returnedAmd - r.exchangeAmd; // positive = cash handed back
    const sp = await prisma.sellingPoint.findUnique({ where: { id: sellingPointId }, select: { name: true } });
    const verb = r.exchangeAmd > 0 ? 'Exchange' : 'Return';
    const cashLine = netCashOut > 0
      ? `${formatAmd(netCashOut)} refunded from the drawer`
      : netCashOut < 0
        ? `${formatAmd(-netCashOut)} collected (upgrade)`
        : 'even exchange — no cash moved';
    await notify({
      type: 'NEW_SALE',
      toAdmins: true,
      title: `${verb} ${r.returnNumber} · ${cashLine}`,
      body: `${verb} at ${sp?.name ?? 'a selling point'}: ${formatAmd(r.returnedAmd)} returned${r.exchangeAmd > 0 ? `, ${formatAmd(r.exchangeAmd)} taken in exchange` : ''} (by ${u.fullName}).`,
      // Link to the new purchase's receipt when there was an exchange; a pure
      // return has no sale receipt, so leave the CTA off (null relatedId).
      relatedId: r.exchangeSaleId ?? undefined,
    });
  } catch (e) {
    console.error('[return] notification failed', e);
  }

  return NextResponse.json(result);
}
