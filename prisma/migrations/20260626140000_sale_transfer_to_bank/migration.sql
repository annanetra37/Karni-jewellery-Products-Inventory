-- Portion of a cash sale received by bank transfer / card instead of drawer cash.
ALTER TABLE "Sale" ADD COLUMN "transferToBankAmd" DECIMAL(12,2) NOT NULL DEFAULT 0;
