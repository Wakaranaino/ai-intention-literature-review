PRAGMA foreign_keys=OFF;

CREATE TABLE "Paper_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "venue" TEXT,
    "paperKind" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "doi" TEXT,
    "doiUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "semanticScholarId" TEXT,
    "arxivId" TEXT,
    "citationCount" INTEGER,
    "watchlisted" BOOLEAN NOT NULL DEFAULT false,
    "worksheetCitationText" TEXT,
    "worksheetSourceLink" TEXT,
    "contentType" TEXT,
    "contentTypeOtherText" TEXT,
    "qualityScore" INTEGER,
    "worksheetNote" TEXT,
    "relevanceScore" INTEGER,
    "extractablePotential" TEXT,
    "codeRepoUrl" TEXT,
    "datasetUrl" TEXT,
    "projectUrl" TEXT,
    "linksProvenance" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "Paper_new" (
    "id",
    "title",
    "abstract",
    "authors",
    "year",
    "publishedAt",
    "venue",
    "paperKind",
    "doi",
    "doiUrl",
    "sourceUrl",
    "pdfUrl",
    "semanticScholarId",
    "arxivId",
    "citationCount",
    "watchlisted",
    "worksheetCitationText",
    "worksheetSourceLink",
    "contentType",
    "contentTypeOtherText",
    "qualityScore",
    "worksheetNote",
    "relevanceScore",
    "extractablePotential",
    "codeRepoUrl",
    "datasetUrl",
    "projectUrl",
    "linksProvenance",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "title",
    "abstract",
    "authors",
    "year",
    "publishedAt",
    "venue",
    "paperKind",
    "doi",
    "doiUrl",
    "sourceUrl",
    "pdfUrl",
    "semanticScholarId",
    "arxivId",
    "citationCount",
    "watchlisted",
    "worksheetCitationText",
    "worksheetSourceLink",
    "contentType",
    "contentTypeOtherText",
    "qualityScore",
    "worksheetNote",
    "relevanceScore",
    "extractablePotential",
    "codeRepoUrl",
    "datasetUrl",
    "projectUrl",
    CAST("linksProvenance" AS TEXT),
    "createdAt",
    "updatedAt"
FROM "Paper";

DROP TABLE "Paper";
ALTER TABLE "Paper_new" RENAME TO "Paper";

CREATE UNIQUE INDEX "Paper_doi_key" ON "Paper"("doi");
CREATE UNIQUE INDEX "Paper_semanticScholarId_key" ON "Paper"("semanticScholarId");
CREATE UNIQUE INDEX "Paper_arxivId_key" ON "Paper"("arxivId");
CREATE INDEX "Paper_publishedAt_idx" ON "Paper"("publishedAt");
CREATE INDEX "Paper_year_idx" ON "Paper"("year");
CREATE INDEX "Paper_watchlisted_idx" ON "Paper"("watchlisted");

PRAGMA foreign_keys=ON;
