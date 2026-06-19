-- A cash sale whose money went straight to the safe (online / delivery order),
-- so it never entered the drawer and must be excluded from drawer reconciliation.
ALTER TABLE "Sale" ADD COLUMN "cashToSafe" BOOLEAN NOT NULL DEFAULT false;
