import { createHash } from "node:crypto";

import { ContentType, ExtractablePotential, PaperKind, Prisma, PrismaClient } from "@prisma/client";

import { stringifyLinksProvenance, type LinkProvenance } from "./curation";
import { normalizePaperKeyFromPaper } from "./paper-keys";
import { getMatchedTagNames, type TagRules } from "./tagging";

export type IngestPaperInput = {
  title: string;
  abstract: string;
  authors: string;
  year: number;
  publishedAt: Date;
  venue?: string | null;
  paperKind: PaperKind;
  doi?: string | null;
  doiUrl?: string | null;
  sourceUrl: string;
  pdfUrl: string;
  semanticScholarId?: string | null;
  arxivId?: string | null;
  citationCount?: number | null;
  watchlisted?: boolean;
  worksheetCitationText?: string | null;
  worksheetSourceLink?: string | null;
  contentTypePrimary?: ContentType | null;
  contentTypeSecondary?: ContentType | null;
  contentTypeOtherText?: string | null;
  qualityScore?: number | null;
  worksheetNote?: string | null;
  relevanceScore?: number | null;
  extractablePotential?: ExtractablePotential | null;
  studyLink?: string | null;
  linksProvenance?: LinkProvenance | string | null;
};

export type UpsertSummary = {
  created: number;
  updated: number;
};

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleHash(title: string) {
  return createHash("sha256").update(normalizeTitle(title)).digest("hex");
}

function cleanOptional(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildPaperData(input: IngestPaperInput): Prisma.PaperUncheckedCreateInput {
  const doi = cleanOptional(input.doi);
  const paperData: Prisma.PaperUncheckedCreateInput = {
    title: input.title.trim(),
    abstract: input.abstract.trim(),
    authors: input.authors.trim(),
    year: input.year,
    publishedAt: input.publishedAt,
    venue: cleanOptional(input.venue),
    paperKind: input.paperKind ?? PaperKind.UNKNOWN,
    doi,
    doiUrl: input.doiUrl ?? (doi ? `https://doi.org/${doi}` : null),
    sourceUrl: input.sourceUrl,
    paperKey: normalizePaperKeyFromPaper({
      doi,
      doiUrl: input.doiUrl ?? null,
      sourceUrl: input.sourceUrl,
      arxivId: input.arxivId ?? null,
      semanticScholarId: input.semanticScholarId ?? null,
    }),
    pdfUrl: input.pdfUrl,
    semanticScholarId: cleanOptional(input.semanticScholarId),
    arxivId: cleanOptional(input.arxivId),
    citationCount: input.citationCount ?? null,
    watchlisted: input.watchlisted ?? false,
  };

  if ("worksheetCitationText" in input) {
    paperData.worksheetCitationText = cleanOptional(input.worksheetCitationText);
  }
  if ("worksheetSourceLink" in input) {
    paperData.worksheetSourceLink = cleanOptional(input.worksheetSourceLink);
  }
  if ("contentTypePrimary" in input) {
    paperData.contentTypePrimary = input.contentTypePrimary ?? null;
  }
  if ("contentTypeSecondary" in input) {
    paperData.contentTypeSecondary = input.contentTypeSecondary ?? null;
  }
  if ("contentTypeOtherText" in input) {
    paperData.contentTypeOtherText = cleanOptional(input.contentTypeOtherText);
  }
  if ("qualityScore" in input) {
    paperData.qualityScore = input.qualityScore ?? null;
  }
  if ("worksheetNote" in input) {
    paperData.worksheetNote = cleanOptional(input.worksheetNote);
  }
  if ("relevanceScore" in input) {
    paperData.relevanceScore = input.relevanceScore ?? null;
  }
  if ("extractablePotential" in input) {
    paperData.extractablePotential = input.extractablePotential ?? null;
  }
  if ("studyLink" in input) {
    paperData.studyLink = cleanOptional(input.studyLink);
  }
  if ("linksProvenance" in input) {
    paperData.linksProvenance =
      typeof input.linksProvenance === "string"
        ? input.linksProvenance
        : stringifyLinksProvenance(input.linksProvenance ?? null);
  }

  return paperData;
}

export async function upsertPaperRecords(
  prisma: PrismaClient,
  papers: IngestPaperInput[],
  tagRules: TagRules,
): Promise<UpsertSummary> {
  const existingPapers = await prisma.paper.findMany({
    select: { id: true, doi: true, arxivId: true, title: true, watchlisted: true },
  });

  const byDoi = new Map<string, { id: string; watchlisted: boolean }>();
  const byArxivId = new Map<string, { id: string; watchlisted: boolean }>();
  const byTitleHash = new Map<string, { id: string; watchlisted: boolean }>();

  for (const paper of existingPapers) {
    if (paper.doi) {
      byDoi.set(paper.doi.toLowerCase(), { id: paper.id, watchlisted: paper.watchlisted });
    }
    if (paper.arxivId) {
      byArxivId.set(paper.arxivId.toLowerCase(), {
        id: paper.id,
        watchlisted: paper.watchlisted,
      });
    }
    byTitleHash.set(titleHash(paper.title), { id: paper.id, watchlisted: paper.watchlisted });
  }

  let created = 0;
  let updated = 0;

  for (const record of papers) {
    const paperData = buildPaperData(record);
    const dedupeRecord =
      (paperData.doi ? byDoi.get(paperData.doi.toLowerCase()) : undefined) ??
      (paperData.arxivId ? byArxivId.get(paperData.arxivId.toLowerCase()) : undefined) ??
      byTitleHash.get(titleHash(paperData.title));

    const tagNames = getMatchedTagNames(
      { title: paperData.title, abstract: paperData.abstract },
      tagRules,
    );

    const persisted = await prisma.$transaction(async (tx) => {
      const savedPaper = dedupeRecord
        ? await tx.paper.update({
            where: { id: dedupeRecord.id },
            data: {
              ...paperData,
              watchlisted:
                record.watchlisted === undefined
                  ? dedupeRecord.watchlisted
                  : record.watchlisted,
            },
          })
        : await tx.paper.create({
            data: paperData,
          });

      const tagIds: string[] = [];
      for (const tagName of tagNames) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        tagIds.push(tag.id);
      }

      await tx.paperTag.deleteMany({ where: { paperId: savedPaper.id } });
      if (tagIds.length > 0) {
        await tx.paperTag.createMany({
          data: tagIds.map((tagId) => ({ paperId: savedPaper.id, tagId })),
        });
      }

      return savedPaper;
    });

    const statusRecord = {
      id: persisted.id,
      watchlisted: persisted.watchlisted,
    };

    if (paperData.doi) {
      byDoi.set(paperData.doi.toLowerCase(), statusRecord);
    }
    if (paperData.arxivId) {
      byArxivId.set(paperData.arxivId.toLowerCase(), statusRecord);
    }
    byTitleHash.set(titleHash(paperData.title), statusRecord);

    if (dedupeRecord) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { created, updated };
}
