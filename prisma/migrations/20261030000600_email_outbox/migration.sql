CREATE TABLE "EmailOutbox" (
  "id" UUID NOT NULL PRIMARY KEY,
  "payload" TEXT,
  "actionTokenId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lockToken" UUID,
  "deliveredAt" TIMESTAMP(3),
  "abandonedAt" TIMESTAMP(3)
);
CREATE INDEX "EmailOutbox_availableAt_lockedUntil_idx" ON "EmailOutbox"("availableAt", "lockedUntil");
