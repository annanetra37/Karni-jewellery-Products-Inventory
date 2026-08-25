-- Attribute a return/exchange's cash impact to a specific drawer session, and
-- store its signed net drawer effect so reconciliation lands on the right shift
-- even when the return is recorded later.

ALTER TABLE "SaleReturn" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "SaleReturn" ADD COLUMN "drawerDeltaAmd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill the net drawer effect for existing returns. The exchange half was
-- previously booked as a normal cash sale, so the net the drawer saw was
-- (new items − returned credit); only refunds that came from the drawer moved
-- cash.
UPDATE "SaleReturn"
  SET "drawerDeltaAmd" = CASE WHEN "refundFromDrawer" THEN "exchangeAmd" - "returnedAmd" ELSE 0 END;

CREATE INDEX "SaleReturn_cashSessionId_idx" ON "SaleReturn"("cashSessionId");

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "CashDrawerSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
