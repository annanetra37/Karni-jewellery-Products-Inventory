-- Per-selling-point scoping for ADMIN users.
CREATE TABLE "AdminSellingPoint" (
  "userId" TEXT NOT NULL,
  "sellingPointId" TEXT NOT NULL,
  CONSTRAINT "AdminSellingPoint_pkey" PRIMARY KEY ("userId", "sellingPointId")
);

CREATE INDEX "AdminSellingPoint_sellingPointId_idx" ON "AdminSellingPoint"("sellingPointId");

ALTER TABLE "AdminSellingPoint"
  ADD CONSTRAINT "AdminSellingPoint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminSellingPoint"
  ADD CONSTRAINT "AdminSellingPoint_sellingPointId_fkey"
  FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing full admins become super admins so the owner keeps global control.
-- Newly created ADMINs will be the point-scoped tier.
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';
