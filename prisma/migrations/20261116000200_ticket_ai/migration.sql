BEGIN;
CREATE TYPE "TicketResolutionSource" AS ENUM ('HUMAN', 'AI');
CREATE TYPE "TicketAiStatus" AS ENUM ('PENDING', 'RUNNING', 'PROPOSED', 'RESOLVED', 'REJECTED', 'STALE', 'FAILED');
ALTER TABLE "Ticket"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resolutionText" TEXT,
  ADD COLUMN "resolutionSource" "TicketResolutionSource",
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionProcedureId" TEXT;
CREATE TABLE "TicketAiJob" (
  "ticketId" UUID PRIMARY KEY REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "status" "TicketAiStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" UUID,
  "draft" TEXT,
  "errorCode" TEXT
);
CREATE INDEX "TicketAiJob_status_availableAt_idx" ON "TicketAiJob" ("status", "availableAt");
CREATE INDEX "TicketAiJob_status_leaseUntil_idx" ON "TicketAiJob" ("status", "leaseUntil");
COMMIT;
