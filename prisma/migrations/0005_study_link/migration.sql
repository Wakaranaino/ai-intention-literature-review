ALTER TABLE "Paper" ADD COLUMN "studyLink" TEXT;

UPDATE "Paper"
SET "studyLink" = COALESCE(
    NULLIF("projectUrl", ''),
    NULLIF("datasetUrl", ''),
    NULLIF("codeRepoUrl", '')
)
WHERE "studyLink" IS NULL;
