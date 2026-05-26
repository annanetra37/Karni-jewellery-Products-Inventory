-- Add audit fields to InventoryItem: who first created the row (i.e. who first
-- checked stock into that variant/sellingPoint pair) and when.
ALTER TABLE "InventoryItem"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: attribute existing rows to the user named in the first
-- corresponding StockMovement (if any).
UPDATE "InventoryItem" ii
SET "createdById" = sm."performedById",
    "firstSeenAt" = sm."createdAt"
FROM (
  SELECT DISTINCT ON ("variantId", "sellingPointId")
    "variantId", "sellingPointId", "performedById", "createdAt"
  FROM "StockMovement"
  ORDER BY "variantId", "sellingPointId", "createdAt" ASC
) sm
WHERE sm."variantId" = ii."variantId"
  AND sm."sellingPointId" = ii."sellingPointId";
