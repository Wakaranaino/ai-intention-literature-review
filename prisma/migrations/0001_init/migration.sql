CREATE TABLE "Paper" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

CREATE TABLE "PaperTag" (
    "paperId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("paperId", "tagId"),
    CONSTRAINT "PaperTag_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Paper_doi_key" ON "Paper"("doi");
CREATE UNIQUE INDEX "Paper_semanticScholarId_key" ON "Paper"("semanticScholarId");
CREATE UNIQUE INDEX "Paper_arxivId_key" ON "Paper"("arxivId");
CREATE INDEX "Paper_publishedAt_idx" ON "Paper"("publishedAt");
CREATE INDEX "Paper_year_idx" ON "Paper"("year");
CREATE INDEX "Paper_watchlisted_idx" ON "Paper"("watchlisted");
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE INDEX "PaperTag_tagId_idx" ON "PaperTag"("tagId");
