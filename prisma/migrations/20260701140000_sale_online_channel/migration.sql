-- Which channel an online sale came through (FACEBOOK | INSTAGRAM), so we can
-- measure which performs better. A label only — not tied to a selling point.
ALTER TABLE "Sale" ADD COLUMN "onlineChannel" TEXT;
