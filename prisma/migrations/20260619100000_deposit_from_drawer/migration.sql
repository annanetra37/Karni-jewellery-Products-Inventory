-- Whether a safe deposit's cash came from the drawer (reduces the next drawer
-- opening) or not (e.g. after-hours sale cash put straight in the safe).
ALTER TABLE "SafeTransaction" ADD COLUMN "fromDrawer" BOOLEAN NOT NULL DEFAULT true;
