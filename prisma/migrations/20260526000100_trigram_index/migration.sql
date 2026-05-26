-- Fuzzy search index for product search (§4).
-- Requires pg_trgm (already created by the init migration).
CREATE INDEX IF NOT EXISTS "variant_search_trgm"
  ON "Variant" USING gin ("searchBlob" gin_trgm_ops);
