ALTER TABLE "Paper" ADD COLUMN "worksheetExportedAt" DATETIME;

CREATE INDEX IF NOT EXISTS "Paper_worksheetExportedAt_idx" ON "Paper"("worksheetExportedAt");
