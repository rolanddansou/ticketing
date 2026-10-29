BEGIN;

-- Existing tickets require an explicit creator backfill strategy before this migration.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Ticket") THEN
        RAISE EXCEPTION 'Cannot add required createdById: Ticket must be empty. Existing tickets require a separate backfill migration.';
    END IF;
END $$;

CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'AGENT', 'VIEWER');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Ticket"
    ADD COLUMN "createdById" UUID NOT NULL,
    ADD COLUMN "assignedToId" UUID,
    ADD COLUMN "resolveById" UUID;

CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");
CREATE INDEX "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX "Ticket_resolveById_idx" ON "Ticket"("resolveById");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_resolveById_fkey" FOREIGN KEY ("resolveById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
