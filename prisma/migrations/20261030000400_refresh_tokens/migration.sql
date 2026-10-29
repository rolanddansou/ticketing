CREATE TABLE "RefreshToken" (
  "id" UUID NOT NULL PRIMARY KEY,
  "hash" TEXT NOT NULL,
  "sessionId" UUID NOT NULL REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "RefreshToken_hash_key" ON "RefreshToken"("hash");
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
