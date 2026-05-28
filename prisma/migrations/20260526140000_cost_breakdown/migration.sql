-- Cost breakdown on Variant
ALTER TABLE "Variant"
  ADD COLUMN "metalType" TEXT,
  ADD COLUMN "metalCostAmd" DECIMAL(12,2),
  ADD COLUMN "fillingMaterial" TEXT,
  ADD COLUMN "fillingCostAmd" DECIMAL(12,2),
  ADD COLUMN "platingType" TEXT,
  ADD COLUMN "platingCostAmd" DECIMAL(12,2),
  ADD COLUMN "laborCostAmd" DECIMAL(12,2);

-- Seed metal / plating / filling descriptors on variants from their design,
-- where the design carried free-text values (no costs — those are entered later).
UPDATE "Variant" v
SET "metalType" = d."metal",
    "platingType" = d."plating",
    "fillingMaterial" = d."enamelType"
FROM "Design" d
WHERE d.id = v."designId"
  AND v."metalType" IS NULL;

-- Order line items: per-line cost breakdown + custom-item support
ALTER TABLE "OrderLineItem"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "metalType" TEXT,
  ADD COLUMN "metalCostAmd" DECIMAL(12,2),
  ADD COLUMN "fillingMaterial" TEXT,
  ADD COLUMN "fillingCostAmd" DECIMAL(12,2),
  ADD COLUMN "platingType" TEXT,
  ADD COLUMN "platingCostAmd" DECIMAL(12,2),
  ADD COLUMN "laborCostAmd" DECIMAL(12,2),
  ADD COLUMN "unitPriceAmd" DECIMAL(12,2);

-- Allow fully custom order lines with no catalog variant
ALTER TABLE "OrderLineItem" ALTER COLUMN "variantId" DROP NOT NULL;
