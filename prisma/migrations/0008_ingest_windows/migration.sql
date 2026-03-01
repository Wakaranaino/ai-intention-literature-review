CREATE TABLE IF NOT EXISTS "IngestWindow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IngestWindow_mode_startDate_endDate_key"
  ON "IngestWindow"("mode", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "IngestWindow_mode_startDate_endDate_idx"
  ON "IngestWindow"("mode", "startDate", "endDate");
