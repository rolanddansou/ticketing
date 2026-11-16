CREATE TYPE "AuditAction" AS ENUM ('ROLE_CHANGED', 'ACCOUNT_DISABLED', 'ACCOUNT_REACTIVATED');
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL PRIMARY KEY,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "metadata" JSONB NOT NULL
);
CREATE INDEX "AuditEvent_targetId_timestamp_idx" ON "AuditEvent"("targetId", "timestamp");
