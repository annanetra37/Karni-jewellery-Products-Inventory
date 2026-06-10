-- Business-owner flag.
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Safe ledger.
CREATE TYPE "SafeTxType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

CREATE TABLE "SafeTransaction" (
  "id" TEXT NOT NULL,
  "type" "SafeTxType" NOT NULL,
  "amountAmd" DECIMAL(12,2) NOT NULL,
  "sellingPointId" TEXT,
  "ownerId" TEXT,
  "performedById" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafeTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafeTransaction_type_occurredAt_idx" ON "SafeTransaction"("type", "occurredAt");
CREATE INDEX "SafeTransaction_ownerId_idx" ON "SafeTransaction"("ownerId");
CREATE INDEX "SafeTransaction_sellingPointId_occurredAt_idx" ON "SafeTransaction"("sellingPointId", "occurredAt");

ALTER TABLE "SafeTransaction" ADD CONSTRAINT "SafeTransaction_sellingPointId_fkey"
  FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafeTransaction" ADD CONSTRAINT "SafeTransaction_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafeTransaction" ADD CONSTRAINT "SafeTransaction_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
