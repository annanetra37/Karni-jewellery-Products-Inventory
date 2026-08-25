-- Shared team notes: any signed-in user can post a note for the whole team
-- (handover info, "customer will come back tomorrow for X", reminders).

CREATE TABLE "TeamNote" (
  "id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamNote_resolvedAt_createdAt_idx" ON "TeamNote"("resolvedAt", "createdAt");

ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
