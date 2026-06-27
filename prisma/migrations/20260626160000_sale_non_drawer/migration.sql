-- Generalise the "received by bank" portion to any non-drawer portion, and
-- record where it went (the safe vs the company bank account).
ALTER TABLE "Sale" RENAME COLUMN "transferToBankAmd" TO "nonDrawerAmd";
ALTER TABLE "Sale" ADD COLUMN "nonDrawerToSafe" BOOLEAN NOT NULL DEFAULT false;
