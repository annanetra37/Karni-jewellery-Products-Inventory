-- Break times for sales reps during a shift; an open break (endedAt null) puts the shift on hold.
CREATE TABLE "ShiftBreak" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "ShiftBreak_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShiftBreak_sessionId_idx" ON "ShiftBreak"("sessionId");
ALTER TABLE "ShiftBreak" ADD CONSTRAINT "ShiftBreak_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashDrawerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
