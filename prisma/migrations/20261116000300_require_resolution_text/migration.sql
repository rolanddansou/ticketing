BEGIN;

ALTER TABLE "TicketAiJob" ADD COLUMN "requiresResolutionText" BOOLEAN NOT NULL DEFAULT false;

-- Earlier proposals do not carry their original scope classification.
UPDATE "TicketAiJob" SET "requiresResolutionText" = true WHERE "status" = 'PROPOSED';

COMMIT;
