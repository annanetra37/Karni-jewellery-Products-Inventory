-- Flag default add-ons (e.g. the accessory chain bundled with pendants) so they
-- can be excluded from "most sold" reports.
ALTER TABLE "Variant" ADD COLUMN "excludeFromTopSellers" BOOLEAN NOT NULL DEFAULT false;
