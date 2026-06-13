-- Whole-sale discount, resolved to a fixed AMD amount. totalAmd = subtotalAmd - discountAmd.
ALTER TABLE "Sale" ADD COLUMN "discountAmd" DECIMAL(12,2) NOT NULL DEFAULT 0;
