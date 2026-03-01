ALTER TABLE "Paper" ADD COLUMN "paperKey" TEXT;

CREATE INDEX IF NOT EXISTS "Paper_paperKey_idx" ON "Paper"("paperKey");

CREATE TABLE IF NOT EXISTS "ExcludedPaper" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExcludedPaper_key_key" ON "ExcludedPaper"("key");
