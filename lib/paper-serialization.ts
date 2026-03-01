import { Prisma } from "@prisma/client";

import { parseLinksProvenance } from "./curation";
import { normalizePaperKeyFromPaper } from "./paper-keys";
import type { PaperRecord } from "./papers";

export const basePaperInclude = {
  paperTags: {
    include: {
      tag: true,
    },
  },
} satisfies Prisma.PaperInclude;

export function serializePaper(
  paper: Prisma.PaperGetPayload<{ include: typeof basePaperInclude }>,
  excludedKeys: ReadonlySet<string> = new Set(),
): PaperRecord {
  const paperKey =
    paper.paperKey ??
    normalizePaperKeyFromPaper({
      doi: paper.doi,
      doiUrl: paper.doiUrl,
      sourceUrl: paper.sourceUrl,
      arxivId: paper.arxivId,
      semanticScholarId: paper.semanticScholarId,
    });

  return {
    id: paper.id,
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    year: paper.year,
    publishedAt: paper.publishedAt.toISOString(),
    venue: paper.venue,
    paperKind: paper.paperKind,
    doi: paper.doi,
    doiUrl: paper.doiUrl,
    sourceUrl: paper.sourceUrl,
    pdfUrl: paper.pdfUrl,
    semanticScholarId: paper.semanticScholarId,
    arxivId: paper.arxivId,
    citationCount: paper.citationCount,
    watchlisted: paper.watchlisted,
    paperKey,
    isExcluded: paperKey ? excludedKeys.has(paperKey) : false,
    worksheetExportedAt: paper.worksheetExportedAt?.toISOString() ?? null,
    worksheetCitationText: paper.worksheetCitationText,
    worksheetSourceLink: paper.worksheetSourceLink,
    contentTypePrimary: paper.contentTypePrimary,
    contentTypeSecondary: paper.contentTypeSecondary,
    contentTypeOtherText: paper.contentTypeOtherText,
    qualityScore: paper.qualityScore,
    worksheetNote: paper.worksheetNote,
    relevanceScore: paper.relevanceScore,
    extractablePotential: paper.extractablePotential,
    studyLink: paper.studyLink,
    linksProvenance: parseLinksProvenance(paper.linksProvenance),
    tags: paper.paperTags.map((paperTag) => paperTag.tag.name).sort(),
  };
}
