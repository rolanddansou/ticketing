CREATE TYPE "ActionTokenType" AS ENUM ('INVITATION', 'PASSWORD_RESET');
CREATE TABLE "ActionToken" (
  "id" UUID NOT NULL PRIMARY KEY,
  "hash" TEXT NOT NULL,
  "type" "ActionTokenType" NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ActionToken_hash_key" ON "ActionToken"("hash");
CREATE INDEX "ActionToken_userId_type_idx" ON "ActionToken"("userId", "type");
CREATE INDEX "ActionToken_expiresAt_idx" ON "ActionToken"("expiresAt");
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_actionTokenId_fkey" FOREIGN KEY ("actionTokenId") REFERENCES "ActionToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
