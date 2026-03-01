import { Prisma } from "@prisma/client";

import type { LinkProvenance } from "./curation";
import { getExcludedPaperKeySet } from "./excluded-papers";
import { basePaperInclude, serializePaper } from "./paper-serialization";
import prisma from "./prisma";

export type PaperRecord = {
  id: string;
  title: string;
  abstract: string;
  authors: string;
  year: number;
  publishedAt: string;
  venue: string | null;
  paperKind: string;
  doi: string | null;
  doiUrl: string | null;
  sourceUrl: string;
  pdfUrl: string;
  semanticScholarId: string | null;
  arxivId: string | null;
  citationCount: number | null;
  watchlisted: boolean;
  paperKey: string | null;
  isExcluded: boolean;
  worksheetExportedAt: string | null;
  worksheetCitationText: string | null;
  worksheetSourceLink: string | null;
  contentTypePrimary: string | null;
  contentTypeSecondary: string | null;
  contentTypeOtherText: string | null;
  qualityScore: number | null;
  worksheetNote: string | null;
  relevanceScore: number | null;
  extractablePotential: string | null;
  studyLink: string | null;
  linksProvenance: LinkProvenance | null;
  tags: string[];
};

export type RadarData = {
  ready: boolean;
  papers: PaperRecord[];
  tags: string[];
  error?: string;
};

async function getPaperRecords(where: Prisma.PaperWhereInput): Promise<PaperRecord[]> {
  const [papers, excludedKeys] = await Promise.all([
    prisma.paper.findMany({
      where,
      include: basePaperInclude,
      orderBy: {
        publishedAt: "desc",
      },
    }),
    getExcludedPaperKeySet(),
  ]);

  return papers.map((paper) => serializePaper(paper, excludedKeys));
}

export async function getRadarData(): Promise<RadarData> {
  try {
    const [papers, tags] = await Promise.all([
      getPaperRecords({
        publishedAt: {
          gte: new Date("2023-01-01T00:00:00.000Z"),
          lte: new Date(),
        },
      }),
      prisma.tag.findMany({
        orderBy: { name: "asc" },
        select: { name: true },
      }),
    ]);

    return {
      ready: true,
      papers,
      tags: tags.map((tag) => tag.name),
    };
  } catch (error) {
    return {
      ready: false,
      papers: [],
      tags: [],
      error: error instanceof Error ? error.message : "Unknown database error.",
    };
  }
}

export async function getWatchlistData(): Promise<RadarData> {
  try {
    const papers = await getPaperRecords({
      watchlisted: true,
      publishedAt: {
        gte: new Date("2023-01-01T00:00:00.000Z"),
        lte: new Date(),
      },
    });

    return {
      ready: true,
      papers,
      tags: [],
    };
  } catch (error) {
    return {
      ready: false,
      papers: [],
      tags: [],
      error: error instanceof Error ? error.message : "Unknown database error.",
    };
  }
}
