-- Receiving sessions: group stock check-ins recorded together, optionally with
-- photos of the owner's hand-written "ready for Megamall" book pages so received
-- quantities can be checked against what was written down.

CREATE TABLE "ReceivingBatch" (
  "id" TEXT NOT NULL,
  "sellingPointId" TEXT NOT NULL,
  "performedById" TEXT NOT NULL,
  "note" TEXT,
  "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivingBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StockMovement" ADD COLUMN "batchId" TEXT;

CREATE INDEX "ReceivingBatch_sellingPointId_createdAt_idx" ON "ReceivingBatch"("sellingPointId", "createdAt");

ALTER TABLE "ReceivingBatch" ADD CONSTRAINT "ReceivingBatch_sellingPointId_fkey"
  FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivingBatch" ADD CONSTRAINT "ReceivingBatch_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ReceivingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
