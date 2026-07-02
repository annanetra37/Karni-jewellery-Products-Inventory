-- Price/cost change audit trail for variants.
CREATE TABLE "VariantPriceChange" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "oldPriceAmd" DECIMAL(12,2),
  "newPriceAmd" DECIMAL(12,2) NOT NULL,
  "oldCostAmd" DECIMAL(12,2),
  "newCostAmd" DECIMAL(12,2),
  "changedById" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VariantPriceChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VariantPriceChange_variantId_createdAt_idx" ON "VariantPriceChange"("variantId", "createdAt");

ALTER TABLE "VariantPriceChange" ADD CONSTRAINT "VariantPriceChange_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantPriceChange" ADD CONSTRAINT "VariantPriceChange_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Optional customer profession.
ALTER TABLE "Customer" ADD COLUMN "profession" TEXT;
