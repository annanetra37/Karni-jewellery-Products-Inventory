-- Richer customer profile: birthday, address, Instagram handle, gender.
-- All columns are nullable so existing customers are untouched; the birthday
-- requirement for new customers is enforced in the application layer.
ALTER TABLE "Customer"
  ADD COLUMN "birthday" DATE,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "instagram" TEXT,
  ADD COLUMN "gender" TEXT;

-- Speeds up upcoming-birthday lookups.
CREATE INDEX "Customer_birthday_idx" ON "Customer"("birthday");
