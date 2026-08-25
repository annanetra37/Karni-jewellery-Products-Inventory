-- Multiple sales reps per shift. The drawer is shared per selling point and
-- counted once; each rep present is a participant. Records attendance/hours and
-- lets every participant see they're on shift.

CREATE TABLE "ShiftParticipant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "ShiftParticipant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftParticipant_sessionId_idx" ON "ShiftParticipant"("sessionId");
CREATE INDEX "ShiftParticipant_userId_joinedAt_idx" ON "ShiftParticipant"("userId", "joinedAt");

ALTER TABLE "ShiftParticipant" ADD CONSTRAINT "ShiftParticipant_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CashDrawerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftParticipant" ADD CONSTRAINT "ShiftParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing shift's owner becomes a participant for the shift's
-- span, so attendance history is preserved.
INSERT INTO "ShiftParticipant" ("id", "sessionId", "userId", "joinedAt", "leftAt")
SELECT 'sp_' || s."id", s."id", s."userId", s."openingAt", s."closingAt"
FROM "CashDrawerSession" s;
