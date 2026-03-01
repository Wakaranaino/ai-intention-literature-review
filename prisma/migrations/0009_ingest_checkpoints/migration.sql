CREATE TABLE IF NOT EXISTS "IngestCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sliceKey" TEXT NOT NULL,
  "nextStart" INTEGER NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IngestCheckpoint_sliceKey_key"
  ON "IngestCheckpoint"("sliceKey");
