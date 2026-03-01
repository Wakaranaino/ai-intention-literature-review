import prisma from "./prisma";
import { extractPaperReferenceCandidate, normalizePaperKeyFromUrl } from "./paper-keys";

export type ExcludeImportSummary = {
  imported: number;
  duplicatesSkipped: number;
  invalidLines: string[];
};

export function parseExcludedPaperLines(input: string) {
  const validEntries: { key: string; sourceUrl: string }[] = [];
  const invalidLines: string[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const candidate = extractPaperReferenceCandidate(trimmed);
    if (!candidate) {
      invalidLines.push(trimmed);
      continue;
    }

    validEntries.push(normalizePaperKeyFromUrl(candidate));
  }

  return { validEntries, invalidLines };
}

export async function importExcludedPaperLinks(input: string): Promise<ExcludeImportSummary> {
  const { validEntries, invalidLines } = parseExcludedPaperLines(input);
  const uniqueEntries = new Map<string, string>();

  for (const entry of validEntries) {
    if (!uniqueEntries.has(entry.key)) {
      uniqueEntries.set(entry.key, entry.sourceUrl);
    }
  }

  const keys = [...uniqueEntries.keys()];
  if (keys.length === 0) {
    return {
      imported: 0,
      duplicatesSkipped: 0,
      invalidLines,
    };
  }

  const existing = await prisma.excludedPaper.findMany({
    where: { key: { in: keys } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((entry) => entry.key));

  const toCreate = keys
    .filter((key) => !existingKeys.has(key))
    .map((key) => ({
      key,
      sourceUrl: uniqueEntries.get(key) ?? key,
    }));

  if (toCreate.length > 0) {
    await prisma.excludedPaper.createMany({
      data: toCreate,
    });
  }

  return {
    imported: toCreate.length,
    duplicatesSkipped: keys.length - toCreate.length,
    invalidLines,
  };
}

export async function getExcludedPaperKeySet() {
  const excludedPapers = await prisma.excludedPaper.findMany({
    select: { key: true },
  });

  return new Set(excludedPapers.map((entry) => entry.key));
}
