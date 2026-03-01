import { createHash } from "node:crypto";

import { PaperKind, PrismaClient } from "@prisma/client";

import { type IngestPaperInput, upsertPaperRecords } from "./ingest-core";
import {
  findMatchedKeywords,
  loadIngestKeywords,
  matchesAnyKeyword,
} from "./ingest-keywords";
import { normalizePaperKeyFromPaper } from "./paper-keys";
import { loadTagRules } from "./tagging";

export type ArxivCandidate = {
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: Date;
  arxivId: string;
  absUrl: string;
  pdfUrl: string;
  doi?: string | null;
};

type SemanticScholarPaper = {
  citationCount?: number | null;
};

type QueryMode = "single" | "grouped";

export type ArxivQueryConfig = {
  mode: QueryMode;
  label: string;
  rawValue: string;
  normalizedValue: string;
  terms: string[];
};

export type FetchArxivOptions = {
  categories?: string;
  maxResults?: number;
  maxPages?: number | null;
};

export type IngestRangeOptions = {
  prisma: PrismaClient;
  startDate: Date;
  endDate: Date;
  maxResults?: number;
  maxPages?: number | null;
  categories?: string;
  logPrefix?: string;
};

const DEFAULT_BEHAVIOR_QUERY_TERMS = [
  "alignment faking",
  "deceptive alignment",
  "deception",
  "deceptive",
  "strategic compliance",
  "sleeper agent",
  "sandbagging",
  "reward hacking",
  "specification gaming",
  "goal misgeneralization",
  "scheming",
  "situational awareness",
  "jailbreak",
  "prompt injection",
  "conditional refusal",
  "policy evasion",
];

type IngestBatchSummary = {
  candidates: number;
  gatedCandidates: number;
  created: number;
  updated: number;
};

class HttpStatusError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

let semanticScholarDisabledForRun = false;
let lastSuccessfulArxivRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getArxivSuccessSpacingDelayMs(
  lastRequestAt: number,
  requestDelayMs: number,
  now = Date.now(),
) {
  if (lastRequestAt <= 0 || requestDelayMs <= 0) {
    return 0;
  }

  return Math.max(requestDelayMs - (now - lastRequestAt), 0);
}

export function resetArxivThrottleState() {
  lastSuccessfulArxivRequestAt = 0;
}

function getRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return null;
  }

  const asSeconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(asSeconds)) {
    return Math.max(asSeconds, 1) * 1000;
  }

  const asDate = new Date(retryAfter);
  if (!Number.isNaN(asDate.getTime())) {
    return Math.max(asDate.getTime() - Date.now(), 1_000);
  }

  return null;
}

async function fetchWithRetry(
  url: string,
  initFactory: () => RequestInit,
  options: {
    label: string;
    retryAttempts?: number;
    baseDelayMs?: number;
    disableOnStatus?: number[];
    onDisabledStatus?: (status: number) => void;
  },
) {
  const retryAttempts = options.retryAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 2_000;

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    try {
      const response = await fetch(url, initFactory());
      if (response.ok) {
        return response;
      }

      const retryable =
        response.status === 429 ||
        response.status === 408 ||
        (response.status >= 500 && response.status <= 599);

      if (options.disableOnStatus?.includes(response.status)) {
        options.onDisabledStatus?.(response.status);
        throw new HttpStatusError(`${options.label} request failed with ${response.status}`, response.status);
      }

      if (!retryable || attempt === retryAttempts) {
        throw new HttpStatusError(`${options.label} request failed with ${response.status}`, response.status);
      }

      const retryAfterMs = getRetryAfterMs(response);
      const delayMs = retryAfterMs ?? baseDelayMs * 2 ** attempt;
      console.warn(
        `${options.label} request hit ${response.status}; retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${retryAttempts + 1}).`,
      );
      await sleep(delayMs);
    } catch (error) {
      const isTimeout =
        error instanceof DOMException
          ? error.name === "TimeoutError" || error.name === "AbortError"
          : error instanceof Error
            ? /timeout|timed out|aborted/i.test(error.message)
            : false;

      if (!isTimeout || attempt === retryAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** attempt;
      console.warn(
        `${options.label} request timed out; retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${retryAttempts + 1}).`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`${options.label} request failed after retries.`);
}

export function envDate(name: string, fallback: Date, aliases: string[] = []) {
  const candidates = [name, ...aliases];
  for (const candidate of candidates) {
    const raw = process.env[candidate];
    if (!raw) {
      continue;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid ${candidate} date: ${raw}`);
    }

    return parsed;
  }

  return fallback;
}

function cleanText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirst(input: string, pattern: RegExp) {
  return pattern.exec(input)?.[1]?.trim() ?? null;
}

function extractAll(input: string, pattern: RegExp) {
  return [...input.matchAll(pattern)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
}

function parseArxivId(absUrl: string) {
  return absUrl.split("/abs/")[1]?.replace(/v\d+$/, "") ?? absUrl;
}

function splitQuotedCommaList(value: string) {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
      current = "";
      continue;
    }

    current += character;
  }

  const trimmed = current.trim();
  if (trimmed) {
    parts.push(trimmed);
  }

  return parts
    .map((part) => part.trim().replace(/^"+|"+$/g, "").trim())
    .filter(Boolean);
}

function normalizeQueryTerm(term: string) {
  return term.trim().replace(/\s+/g, " ");
}

function normalizeQueryMode(rawValue: string | undefined): QueryMode {
  if (rawValue === "single" || rawValue === "grouped") {
    return rawValue;
  }

  if (rawValue && rawValue.trim()) {
    console.warn(`Invalid ARXIV_QUERY_MODE="${rawValue}". Defaulting to "single".`);
  }

  return "single";
}

function dedupeNormalizedTerms(terms: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const term of terms.map(normalizeQueryTerm).filter(Boolean)) {
    const key = term.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(term);
  }

  return deduped;
}

function parseQueryGroups(rawGroups: string) {
  return rawGroups
    .split("||")
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group, index) => {
      const terms = dedupeNormalizedTerms(splitQuotedCommaList(group));
      if (terms.length === 0) {
        throw new Error(`ARXIV_QUERY_GROUPS group ${index + 1} did not contain any valid terms.`);
      }

      return {
        rawValue: group,
        normalizedValue: terms.join(", "),
        terms,
      };
    });
}

export function resolveArxivQueryConfigs(input: {
  mode?: string;
  terms?: string;
  groups?: string;
}): { mode: QueryMode; configs: ArxivQueryConfig[] } {
  const mode = normalizeQueryMode(input.mode);
  const rawTerms = input.terms?.trim() ?? DEFAULT_BEHAVIOR_QUERY_TERMS.join(", ");
  const rawGroups = input.groups?.trim() ?? "";

  if (mode === "grouped") {
    if (!rawGroups) {
      throw new Error('ARXIV_QUERY_GROUPS is required when ARXIV_QUERY_MODE="grouped".');
    }

    const groupedConfigs = parseQueryGroups(rawGroups).map((group, index) => ({
      mode,
      label: `Group ${index + 1}`,
      rawValue: group.rawValue,
      normalizedValue: group.normalizedValue,
      terms: group.terms,
    }));

    return { mode, configs: groupedConfigs };
  }

  const flattenedTerms = dedupeNormalizedTerms([
    ...(rawTerms ? splitQuotedCommaList(rawTerms) : []),
    ...(rawGroups ? parseQueryGroups(rawGroups).flatMap((group) => group.terms) : []),
  ]);

  if (flattenedTerms.length === 0) {
    throw new Error(
      'At least one query term is required in single mode. Set ARXIV_QUERY_TERMS, ARXIV_QUERY_GROUPS, or both.',
    );
  }

  return {
    mode,
    configs: [
      {
        mode,
        label: "Single query",
        rawValue: [rawTerms, rawGroups].filter(Boolean).join(" || "),
        normalizedValue: flattenedTerms.join(", "),
        terms: flattenedTerms,
      },
    ],
  };
}

function getArxivQueryConfigs() {
  return resolveArxivQueryConfigs({
    mode: process.env.ARXIV_QUERY_MODE,
    terms: process.env.ARXIV_QUERY_TERMS,
    groups: process.env.ARXIV_QUERY_GROUPS,
  });
}

function formatArxivDate(date: Date, endOfDay: boolean) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const time = endOfDay ? "2359" : "0000";
  return `${year}${month}${day}${time}`;
}

function buildTermFieldClause(term: string) {
  const normalized = normalizeQueryTerm(term);
  const escaped = normalized.replace(/"/g, '\\"');
  const value = /\s/.test(escaped) ? `"${escaped}"` : escaped;
  return `(ti:${value} OR abs:${value})`;
}

export function buildArxivKeywordClause(terms: string[]) {
  const normalizedTerms = dedupeNormalizedTerms(terms);
  if (normalizedTerms.length === 0) {
    throw new Error("At least one arXiv query term is required.");
  }

  return `(${normalizedTerms.map(buildTermFieldClause).join(" OR ")})`;
}

export function buildArxivSearchQuery(options: {
  categories: string;
  startDate: Date;
  endDate: Date;
  terms: string[];
}) {
  const categoryTerms = options.categories
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean)
    .map((category) => `cat:${category}`);

  if (categoryTerms.length === 0) {
    throw new Error("At least one arXiv category is required.");
  }

  const categoryClause =
    categoryTerms.length === 1 ? categoryTerms[0] : `(${categoryTerms.join(" OR ")})`;
  const dateClause = `submittedDate:[${formatArxivDate(options.startDate, false)} TO ${formatArxivDate(options.endDate, true)}]`;
  const keywordClause = buildArxivKeywordClause(options.terms);

  return `${categoryClause} AND ${dateClause} AND ${keywordClause}`;
}

function buildSliceKey(options: {
  categories: string;
  startDate: Date;
  endDate: Date;
  mode: QueryMode;
  normalizedValue: string;
}) {
  const categories = options.categories
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean)
    .join(",");
  const descriptor = [
    `categories=${categories}`,
    `from=${options.startDate.toISOString().slice(0, 10)}`,
    `to=${options.endDate.toISOString().slice(0, 10)}`,
    `mode=${options.mode}`,
    `query=${options.normalizedValue.toLowerCase()}`,
  ].join("|");
  const hash = createHash("sha256").update(descriptor).digest("hex").slice(0, 16);
  return `arxiv|${descriptor}|hash=${hash}`;
}

async function readCheckpoint(prisma: PrismaClient, sliceKey: string) {
  const rows = await prisma.$queryRaw<Array<{ nextStart: number }>>`
    SELECT "nextStart"
    FROM "IngestCheckpoint"
    WHERE "sliceKey" = ${sliceKey}
    LIMIT 1
  `;

  return rows[0]?.nextStart ?? 0;
}

async function writeCheckpoint(prisma: PrismaClient, sliceKey: string, nextStart: number) {
  await prisma.$executeRaw`
    INSERT INTO "IngestCheckpoint" ("id", "sliceKey", "nextStart", "updatedAt")
    VALUES (lower(hex(randomblob(16))), ${sliceKey}, ${nextStart}, CURRENT_TIMESTAMP)
    ON CONFLICT("sliceKey")
    DO UPDATE SET
      "nextStart" = excluded."nextStart",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

export async function fetchSemanticScholarJson(url: string) {
  if (semanticScholarDisabledForRun) {
    return null;
  }

  const requestTimeoutMs = Number.parseInt(process.env.S2_REQUEST_TIMEOUT_MS ?? "30000", 10);
  const response = await fetchWithRetry(
    url,
    () => ({
      headers: {
        "User-Agent": "AI-Intentions-Literature-Radar/0.1",
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    }),
    {
      label: "Semantic Scholar",
      retryAttempts: Number.parseInt(process.env.S2_RETRY_ATTEMPTS ?? "0", 10),
      baseDelayMs: Number.parseInt(process.env.S2_REQUEST_DELAY_MS ?? "1500", 10),
      disableOnStatus: [429],
      onDisabledStatus: (status) => {
        if (!semanticScholarDisabledForRun) {
          semanticScholarDisabledForRun = true;
          console.warn(
            `Semantic Scholar returned ${status}; disabling citation enrichment for the rest of this run.`,
          );
        }
      },
    },
  );

  if (!response) {
    return null;
  }

  return response.json();
}

async function enrichWithSemanticScholar(candidate: ArxivCandidate) {
  if (semanticScholarDisabledForRun) {
    return null;
  }

  const fields = "citationCount";

  try {
    return (await fetchSemanticScholarJson(
      `https://api.semanticscholar.org/graph/v1/paper/ARXIV:${candidate.arxivId}?fields=${fields}`,
    )) as SemanticScholarPaper;
  } catch {
    return null;
  }
}

function buildArxivPaper(candidate: ArxivCandidate): IngestPaperInput {
  const doi = candidate.doi ?? null;
  return {
    title: candidate.title,
    abstract: candidate.abstract,
    authors: candidate.authors.join(", "),
    year: candidate.publishedAt.getUTCFullYear(),
    publishedAt: candidate.publishedAt,
    venue: null,
    paperKind: PaperKind.PREPRINT,
    doi,
    doiUrl: doi ? `https://doi.org/${doi}` : null,
    sourceUrl: candidate.absUrl,
    pdfUrl: candidate.pdfUrl,
    semanticScholarId: null,
    arxivId: candidate.arxivId,
    citationCount: null,
  };
}

function parseArxivEntries(xml: string) {
  const entries = extractAll(xml, /<entry>([\s\S]*?)<\/entry>/g);
  return entries
    .map((entry): ArxivCandidate | null => {
      const title = extractFirst(entry, /<title>([\s\S]*?)<\/title>/);
      const abstract = extractFirst(entry, /<summary>([\s\S]*?)<\/summary>/);
      const published = extractFirst(entry, /<published>([\s\S]*?)<\/published>/);
      const absUrl = extractFirst(entry, /<id>([\s\S]*?)<\/id>/);
      const doi = extractFirst(entry, /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
      const authors = extractAll(entry, /<name>([\s\S]*?)<\/name>/g);

      if (!title || !abstract || !published || !absUrl) {
        return null;
      }

      const publishedAt = new Date(published);
      if (Number.isNaN(publishedAt.getTime())) {
        return null;
      }

      return {
        title: cleanText(title),
        abstract: cleanText(abstract),
        authors: authors.map(cleanText),
        publishedAt,
        absUrl,
        pdfUrl: absUrl.replace("/abs/", "/pdf/") + ".pdf",
        arxivId: parseArxivId(absUrl),
        doi: doi ? cleanText(doi) : null,
      };
    })
    .filter((entry): entry is ArxivCandidate => Boolean(entry));
}

async function processCandidateBatch(options: {
  prisma: PrismaClient;
  candidates: ArxivCandidate[];
  tagRules: Awaited<ReturnType<typeof loadTagRules>>;
  ingestKeywords: Awaited<ReturnType<typeof loadIngestKeywords>>;
  seenKeys: Set<string>;
  logPrefix: string;
}) {
  const gatedCandidates = options.candidates.filter((candidate) =>
    matchesAnyKeyword(
      { title: candidate.title, abstract: candidate.abstract },
      options.ingestKeywords,
    ),
  );

  console.log(
    `${options.logPrefix}Keyword gate kept ${gatedCandidates.length} candidates and skipped ${
      options.candidates.length - gatedCandidates.length
    } on this page.`,
  );

  const records: IngestPaperInput[] = [];
  const storedCandidates: ArxivCandidate[] = [];

  for (const candidate of gatedCandidates) {
    const merged = buildArxivPaper(candidate);
    const dedupeKey =
      normalizePaperKeyFromPaper({
        doi: merged.doi,
        doiUrl: merged.doiUrl,
        sourceUrl: merged.sourceUrl,
        arxivId: merged.arxivId,
        semanticScholarId: merged.semanticScholarId,
      }) ?? `title:${merged.title.toLowerCase()}`;

    if (options.seenKeys.has(dedupeKey)) {
      continue;
    }

    options.seenKeys.add(dedupeKey);

    const matchedKeywords = findMatchedKeywords(
      { title: candidate.title, abstract: candidate.abstract },
      options.ingestKeywords,
    );
    console.log(
      `${options.logPrefix}Storing arXiv paper: ${candidate.arxivId} (domain: ${matchedKeywords.domainMatches
        .slice(0, 2)
        .join(", ") || "none"}; behavior: ${matchedKeywords.behaviorMatches.slice(0, 3).join(", ")})`,
    );
    records.push(merged);
    storedCandidates.push(candidate);
  }

  if (records.length === 0) {
    return {
      candidates: options.candidates.length,
      gatedCandidates: gatedCandidates.length,
      created: 0,
      updated: 0,
    } satisfies IngestBatchSummary;
  }

  const result = await upsertPaperRecords(options.prisma, records, options.tagRules);

  for (const candidate of storedCandidates) {
    try {
      const enriched = await enrichWithSemanticScholar(candidate);
      if (enriched?.citationCount == null) {
        continue;
      }

      await upsertPaperRecords(
        options.prisma,
        [
          {
            ...buildArxivPaper(candidate),
            citationCount: enriched.citationCount,
          },
        ],
        options.tagRules,
      );
      console.log(
        `${options.logPrefix}Updated citation count for ${candidate.arxivId}: ${enriched.citationCount}`,
      );
    } catch (error) {
      console.warn(
        `${options.logPrefix}Citation enrichment failed for ${candidate.arxivId}; kept arXiv record. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    candidates: options.candidates.length,
    gatedCandidates: gatedCandidates.length,
    created: result.created,
    updated: result.updated,
  } satisfies IngestBatchSummary;
}

async function runArxivQueryConfig(options: {
  prisma: PrismaClient;
  startDate: Date;
  endDate: Date;
  categories: string;
  config: ArxivQueryConfig;
  maxResults: number;
  maxPages: number | null;
  requestDelayMs: number;
  retryAttempts: number;
  requestTimeoutMs: number;
  ingestKeywords: Awaited<ReturnType<typeof loadIngestKeywords>>;
  tagRules: Awaited<ReturnType<typeof loadTagRules>>;
  seenKeys: Set<string>;
  logPrefix: string;
}) {
  const sliceKey = buildSliceKey({
    categories: options.categories,
    startDate: options.startDate,
    endDate: options.endDate,
    mode: options.config.mode,
    normalizedValue: options.config.normalizedValue,
  });
  let start = await readCheckpoint(options.prisma, sliceKey);
  console.log(`${options.logPrefix}Resuming slice ${sliceKey} from start=${start}`);

  if (start < 0) {
    console.log(`${options.logPrefix}Slice ${sliceKey} already completed.`);
    return {
      candidates: 0,
      gatedCandidates: 0,
      created: 0,
      updated: 0,
    } satisfies IngestBatchSummary;
  }

  const searchQuery = buildArxivSearchQuery({
    categories: options.categories,
    startDate: options.startDate,
    endDate: options.endDate,
    terms: options.config.terms,
  });

  let pagesFetched = 0;
  let candidates = 0;
  let gatedCandidates = 0;
  let created = 0;
  let updated = 0;

  while (options.maxPages == null || pagesFetched < options.maxPages) {
    const interRequestDelayMs = getArxivSuccessSpacingDelayMs(
      lastSuccessfulArxivRequestAt,
      options.requestDelayMs,
    );
    if (interRequestDelayMs > 0) {
      console.log(
        `${options.logPrefix}${options.config.label}: waiting ${Math.ceil(interRequestDelayMs / 1000)}s before next arXiv request.`,
      );
      await sleep(interRequestDelayMs);
    }

    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
      searchQuery,
    )}&start=${start}&max_results=${options.maxResults}&sortBy=submittedDate&sortOrder=descending`;

    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        () => ({
          headers: {
            "User-Agent": "AI-Intentions-Literature-Radar/0.1",
          },
          signal: AbortSignal.timeout(options.requestTimeoutMs),
        }),
        {
          label: "arXiv",
          retryAttempts: options.retryAttempts,
          baseDelayMs: options.requestDelayMs > 0 ? options.requestDelayMs : 2_000,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`arXiv fetch failed for sliceKey=${sliceKey} nextStart=${start}: ${message}`);
    }

    lastSuccessfulArxivRequestAt = Date.now();
    const xml = await response.text();
    const batch = parseArxivEntries(xml).filter(
      (candidate) =>
        candidate.publishedAt >= options.startDate && candidate.publishedAt <= options.endDate,
    );

    console.log(
      `${options.logPrefix}${options.config.label}: fetched start=${start} with ${batch.length} candidates.`,
    );

    if (batch.length === 0) {
      await writeCheckpoint(options.prisma, sliceKey, -1);
      break;
    }

    const summary = await processCandidateBatch({
      prisma: options.prisma,
      candidates: batch,
      tagRules: options.tagRules,
      ingestKeywords: options.ingestKeywords,
      seenKeys: options.seenKeys,
      logPrefix: `${options.logPrefix}${options.config.label}: `,
    });

    candidates += summary.candidates;
    gatedCandidates += summary.gatedCandidates;
    created += summary.created;
    updated += summary.updated;

    start += options.maxResults;
    pagesFetched += 1;
    await writeCheckpoint(options.prisma, sliceKey, start);

    if (batch.length < options.maxResults) {
      await writeCheckpoint(options.prisma, sliceKey, -1);
      break;
    }
  }

  return {
    candidates,
    gatedCandidates,
    created,
    updated,
  } satisfies IngestBatchSummary;
}

export async function runIngestRange(options: IngestRangeOptions) {
  const ingestKeywords = await loadIngestKeywords();
  const tagRules = await loadTagRules();
  const logPrefix = options.logPrefix ? `${options.logPrefix} ` : "";
  const categories = options.categories ?? process.env.ARXIV_CATEGORIES ?? "cs.AI";
  const maxResults = options.maxResults ?? Number.parseInt(process.env.ARXIV_MAX_RESULTS ?? "50", 10);
  const maxPages =
    options.maxPages === undefined
      ? (process.env.ARXIV_MAX_PAGES ? Number.parseInt(process.env.ARXIV_MAX_PAGES, 10) : null)
      : options.maxPages;
  const requestDelayMs = Number.parseInt(process.env.ARXIV_REQUEST_DELAY_MS ?? "3000", 10);
  const retryAttempts = Number.parseInt(process.env.ARXIV_RETRY_ATTEMPTS ?? "6", 10);
  const requestTimeoutMs = Number.parseInt(process.env.ARXIV_REQUEST_TIMEOUT_MS ?? "45000", 10);
  const { mode, configs } = getArxivQueryConfigs();

  console.log(
    `${logPrefix}Ingesting papers from ${options.startDate.toISOString().slice(0, 10)} to ${options.endDate
      .toISOString()
      .slice(0, 10)}...`,
  );
  console.log(
    `${logPrefix}Keyword gate loaded with ${ingestKeywords.domainKeywords.length} domain phrases and ${ingestKeywords.behaviorKeywords.length} behavior phrases.`,
  );
  console.log(`${logPrefix}Mode=${mode}; categories=${categories}; maxResults=${maxResults}`);
  if (mode === "single") {
    console.log(`${logPrefix}Single mode: 1 combined query, terms=${configs[0]?.terms.length ?? 0}`);
  } else {
    console.log(`${logPrefix}Grouped mode: per-group queries, groups=${configs.length}`);
  }
  console.log(`${logPrefix}Query-time behavior terms=${configs.flatMap((config) => config.terms).length}`);
  console.log(`${logPrefix}Domain terms excluded at query-time`);

  const seenKeys = new Set<string>();
  let candidates = 0;
  let gatedCandidates = 0;
  let created = 0;
  let updated = 0;

  for (const config of configs) {
    const summary = await runArxivQueryConfig({
      prisma: options.prisma,
      startDate: options.startDate,
      endDate: options.endDate,
      categories,
      config,
      maxResults,
      maxPages,
      requestDelayMs,
      retryAttempts,
      requestTimeoutMs,
      ingestKeywords,
      tagRules,
      seenKeys,
      logPrefix,
    });

    candidates += summary.candidates;
    gatedCandidates += summary.gatedCandidates;
    created += summary.created;
    updated += summary.updated;
  }

  console.log(
    `${logPrefix}Ingestion complete: ${created} created, ${updated} updated, ${gatedCandidates} local-gate matches from ${candidates} fetched candidates.`,
  );

  return {
    candidates,
    gatedCandidates,
    created,
    updated,
  };
}
