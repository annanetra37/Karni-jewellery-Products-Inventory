-- Withdrawal split + reason.
ALTER TABLE "SafeTransaction"
  ADD COLUMN "splitAll" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reason" TEXT;
