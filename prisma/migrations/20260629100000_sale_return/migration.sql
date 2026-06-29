-- Return / exchange with refund. Returned goods are restocked (RETURN
-- movements) and credited to the customer; new pieces taken in exchange are a
-- normal linked Sale. The returned credit is what leaves the drawer when
-- refunded in cash, so drawer reconciliation subtracts it for the shift this
-- return falls in.

CREATE TABLE "SaleReturn" (
  "id" TEXT NOT NULL,
  "returnNumber" TEXT NOT NULL,
  "sellingPointId" TEXT NOT NULL,
  "customerId" TEXT,
  "performedById" TEXT NOT NULL,
  "originalSaleId" TEXT,
  "exchangeSaleId" TEXT,
  "returnedAmd" DECIMAL(12,2) NOT NULL,
  "exchangeAmd" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refundFromDrawer" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleReturnLineItem" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPriceAmd" DECIMAL(12,2) NOT NULL,
  "lineTotalAmd" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "SaleReturnLineItem_pkey" PRIMARY KEY ("id")
);

-- Link RETURN/SALE movements to the return event that produced them.
ALTER TABLE "StockMovement" ADD COLUMN "returnId" TEXT;

CREATE UNIQUE INDEX "SaleReturn_returnNumber_key" ON "SaleReturn"("returnNumber");
CREATE UNIQUE INDEX "SaleReturn_exchangeSaleId_key" ON "SaleReturn"("exchangeSaleId");
CREATE INDEX "SaleReturn_sellingPointId_createdAt_idx" ON "SaleReturn"("sellingPointId", "createdAt");
CREATE INDEX "SaleReturnLineItem_returnId_idx" ON "SaleReturnLineItem"("returnId");

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_sellingPointId_fkey"
  FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_originalSaleId_fkey"
  FOREIGN KEY ("originalSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_exchangeSaleId_fkey"
  FOREIGN KEY ("exchangeSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturnLineItem" ADD CONSTRAINT "SaleReturnLineItem_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleReturnLineItem" ADD CONSTRAINT "SaleReturnLineItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
