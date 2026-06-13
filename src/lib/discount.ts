import { z } from 'zod';

/** A whole-sale discount, expressed as either a fixed AMD amount or a percent. */
export const DiscountSchema = z.object({
  kind: z.enum(['AMOUNT', 'PERCENT']),
  value: z.number().min(0),
});
export type DiscountInput = z.infer<typeof DiscountSchema> | null | undefined;

/**
 * Resolve a discount to a fixed AMD amount, clamped to [0, subtotal] and
 * rounded to the nearest dram. Returns 0 for an empty/zero discount.
 */
export function resolveDiscount(subtotal: number, d: DiscountInput): number {
  if (!d || !d.value || d.value <= 0) return 0;
  const raw = d.kind === 'PERCENT' ? (subtotal * d.value) / 100 : d.value;
  return Math.max(0, Math.min(subtotal, Math.round(raw)));
}
