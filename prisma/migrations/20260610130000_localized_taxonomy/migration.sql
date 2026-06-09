-- Localized (Armenian / Russian) names for categories and collections.
ALTER TABLE "CategoryMeta" ADD COLUMN "nameHy" TEXT, ADD COLUMN "nameRu" TEXT;
ALTER TABLE "CollectionMeta" ADD COLUMN "nameHy" TEXT, ADD COLUMN "nameRu" TEXT;
