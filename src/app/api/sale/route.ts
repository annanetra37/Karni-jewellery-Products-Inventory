import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser, sellingPointScope } from '@/lib/auth';
import { nextNumber, saleNumber } from '@/lib/counter';
import { notify } from '@/lib/notify';
import { formatAmd } from '@/lib/currency';
import { publicOriginFromReq } from '@/lib/origin';
import { DiscountSchema, resolveDiscount } from '@/lib/discount';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const Body = z.object({
  sellingPointId: z.string(),
  customerId: z.string().nullable().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']).optional(),
  cashToSafe: z.boolean().optional(),
  discount: DiscountSchema.nullable().optional(),
  lines: z.array(z.object({
    variantId: z.string(),
    quantity: z.number().int().min(1),
  })).min(1),
});

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  const { sellingPointId, customerId, paymentMethod, discount, lines } = parsed.data;
  // "Cash to safe" only makes sense for a cash sale (money that bypassed the drawer).
  const cashToSafe = (paymentMethod || 'CASH') === 'CASH' ? (parsed.data.cashToSafe ?? false) : false;

  // Enforce the seller's selling-point scope server-side (UI restriction alone
  // is not enough).
  const scope = await sellingPointScope(u);
  if (scope && !scope.includes(sellingPointId)) {
    return NextResponse.json({ error: 'You do not have access to this selling point.' }, { status: 403 });
  }

  // Reject duplicate variantIds — caller should consolidate first.
  const variantIds = lines.map((l) => l.variantId);
  if (new Set(variantIds).size !== variantIds.length) {
    return NextResponse.json({ error: 'duplicate items — consolidate quantities client-side' }, { status: 400 });
  }

  let saleId = '';
  const lowStockHits: { variantSku: string; remaining: number; sellingPointName: string }[] = [];

  try {
    saleId = await prisma.$transaction(async (tx) => {
      const sp = await tx.sellingPoint.findUnique({ where: { id: sellingPointId } });
      if (!sp) throw new Error('Selling point not found');

      // Lock + validate every line first, before any writes.
      type Prepared = {
        line: typeof lines[number];
        variantId: string;
        sku: string;
        unitPriceAmd: number;
        lineTotalAmd: number;
        newQty: number;
        existingItemId: string | null;
        reorderPoint: number;
      };
      const prepared: Prepared[] = [];
      for (const l of lines) {
        const variant = await tx.variant.findUnique({ where: { id: l.variantId } });
        if (!variant) throw new Error('Variant not found');
        const existing = await tx.inventoryItem.findUnique({
          where: { variantId_sellingPointId: { variantId: l.variantId, sellingPointId } },
        });
        const current = existing?.quantity ?? 0;
        if (current < l.quantity) {
          throw new Error(`Only ${current} left at ${sp.name} for ${variant.sku}.`);
        }
        const unit = Number(variant.priceAmd);
        prepared.push({
          line: l,
          variantId: l.variantId,
          sku: variant.sku,
          unitPriceAmd: unit,
          lineTotalAmd: unit * l.quantity,
          newQty: current - l.quantity,
          existingItemId: existing?.id ?? null,
          reorderPoint: variant.reorderPoint,
        });
      }

      const subtotal = prepared.reduce((s, p) => s + p.lineTotalAmd, 0);
      const discountAmd = resolveDiscount(subtotal, discount);
      const n = await nextNumber(tx, 'sale');
      const sNumber = saleNumber(n);

      const sale = await tx.sale.create({
        data: {
          saleNumber: sNumber,
          sellingPointId,
          customerId: customerId || null,
          soldById: u.id,
          subtotalAmd: subtotal,
          discountAmd,
          totalAmd: subtotal - discountAmd,
          paymentMethod: paymentMethod || 'CASH',
          cashToSafe,
          lineItems: {
            create: prepared.map((p) => ({
              variantId: p.variantId,
              quantity: p.line.quantity,
              unitPriceAmd: p.unitPriceAmd,
              lineTotalAmd: p.lineTotalAmd,
            })),
          },
        },
      });

      for (const p of prepared) {
        await tx.stockMovement.create({
          data: {
            variantId: p.variantId,
            sellingPointId,
            type: 'SALE',
            qtyDelta: -p.line.quantity,
            unitPriceAmd: p.unitPriceAmd,
            performedById: u.id,
            saleId: sale.id,
          },
        });
        if (p.existingItemId) {
          await tx.inventoryItem.update({
            where: { id: p.existingItemId },
            data: { quantity: p.newQty },
          });
        } else {
          await tx.inventoryItem.create({
            data: { variantId: p.variantId, sellingPointId, quantity: p.newQty, createdById: u.id },
          });
        }
        if (p.newQty <= p.reorderPoint) {
          lowStockHits.push({ variantSku: p.sku, remaining: p.newQty, sellingPointName: sp.name });
        }
      }
      return sale.id;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Post-commit notifications, debounced per (sku, location).
  if (lowStockHits.length > 0) {
    const ten = new Date(Date.now() - 10 * 60 * 1000);
    for (const r of lowStockHits) {
      const recent = await prisma.notification.findFirst({
        where: {
          type: 'LOW_STOCK',
          relatedId: r.variantSku,
          body: { contains: r.sellingPointName },
          createdAt: { gte: ten },
        },
      });
      if (!recent) {
        await notify({
          type: 'LOW_STOCK', toAdmins: true,
          title: `${r.remaining <= 0 ? 'Out of stock' : 'Low stock'}: ${r.variantSku}`,
          body: `${r.remaining} left at ${r.sellingPointName}`,
          relatedId: r.variantSku,
        });
      }
    }
  }
  // Congratulate the owners on every sale: an in-app notification plus a rich
  // email with the purchase details and a link to view it in the portal.
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: { select: { fullName: true } },
        sellingPoint: { select: { name: true } },
        soldBy: { select: { fullName: true } },
        lineItems: { include: { variant: { select: { designName: true, sku: true, color: true, size: true } } } },
      },
    });
    if (sale) {
      const total = Number(sale.totalAmd);
      const units = sale.lineItems.reduce((n, li) => n + li.quantity, 0);
      const who = sale.customer?.fullName || 'Walk-in';
      const origin = publicOriginFromReq(req);
      const link = `${origin}/sale/${sale.id}/receipt`;

      const rows = sale.lineItems.map((li) => {
        const name = li.variant.designName;
        const variant = [li.variant.color, li.variant.size].filter(Boolean).join(' · ');
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee5cf;">
            <div style="font-weight:600;">${escapeHtml(name)}</div>
            ${variant ? `<div style="font-size:12px;color:#8a938b;">${escapeHtml(variant)}</div>` : ''}
            <div style="font-size:11px;color:#b0b6af;font-family:monospace;">${escapeHtml(li.variant.sku)}</div>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee5cf;text-align:right;white-space:nowrap;">
            ${li.quantity} × ${escapeHtml(formatAmd(Number(li.unitPriceAmd)))}<br>
            <strong>${escapeHtml(formatAmd(Number(li.lineTotalAmd)))}</strong>
          </td>
        </tr>`;
      }).join('');

      const bodyHtml = `
        <p style="font-size:18px;margin:0 0 4px;">🎉 A new purchase just came in!</p>
        <p style="margin:0 0 16px;color:#3a4a3f;">
          <strong>${escapeHtml(formatAmd(total))}</strong> · ${units} ${units === 1 ? 'item' : 'items'}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">${rows}</table>
        <table style="width:100%;font-size:13px;color:#3a4a3f;border-collapse:collapse;">
          <tr><td style="padding:2px 0;color:#8a938b;">Customer</td><td style="text-align:right;">${escapeHtml(who)}</td></tr>
          <tr><td style="padding:2px 0;color:#8a938b;">Selling point</td><td style="text-align:right;">${escapeHtml(sale.sellingPoint.name)}</td></tr>
          <tr><td style="padding:2px 0;color:#8a938b;">Sold by</td><td style="text-align:right;">${escapeHtml(sale.soldBy.fullName)}</td></tr>
          <tr><td style="padding:2px 0;color:#8a938b;">Payment</td><td style="text-align:right;">${escapeHtml(sale.paymentMethod || 'CASH')}</td></tr>
          <tr><td style="padding:2px 0;color:#8a938b;">Sale no.</td><td style="text-align:right;font-family:monospace;">${escapeHtml(sale.saleNumber)}</td></tr>
        </table>`;

      await notify({
        type: 'NEW_SALE',
        toAdmins: true,
        title: `🎉 Congratulations — new purchase! ${formatAmd(total)}`,
        body: `${who} bought ${units} ${units === 1 ? 'item' : 'items'} for ${formatAmd(total)} at ${sale.sellingPoint.name} (sold by ${sale.soldBy.fullName}).`,
        bodyHtml,
        cta: { href: link, label: 'View purchase in portal' },
        relatedId: sale.id,
      });
    }
  } catch (e) {
    // Never let a notification failure break the sale response.
    console.error('[sale] purchase notification failed', e);
  }

  return NextResponse.json({ id: saleId });
}
