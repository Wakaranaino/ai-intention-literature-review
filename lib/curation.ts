import { ContentType } from "@prisma/client";
import type { ExtractablePotential } from "@prisma/client";

export const contentTypeOptions: ContentType[] = [
  ContentType.BENCHMARK,
  ContentType.EVAL_FRAMEWORK,
  ContentType.CONCEPTUAL,
  ContentType.JAILBREAK_STUDY,
  ContentType.RED_TEAMING,
  ContentType.REWARD_HACKING,
  ContentType.ALIGNMENT_FAKING,
  ContentType.CONDITIONAL_BEHAVIOR,
  ContentType.PROMPT_ATTACK_GENERATOR,
  ContentType.MIXED,
  ContentType.OTHER,
];

export const extractablePotentialOptions: ExtractablePotential[] = [
  "DIRECT",
  "ADAPTABLE",
  "NOT",
  "UNKNOWN",
];

function toDisplayCase(value: string) {
  return value
    .split("_")
    .map((part) => {
      const lower = part.toLowerCase();
      return lower ? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}` : lower;
    })
    .join("_");
}

export type LinkProvenance = {
  codeRepo?: "api" | "manual";
  dataset?: "api" | "manual";
  project?: "api" | "manual";
};

export type CitationSource = {
  authors: string;
  year: number;
  title: string;
  venue?: string | null;
};

export type WorksheetLinkSource = {
  doi?: string | null;
  doiUrl?: string | null;
  sourceUrl: string;
  pdfUrl?: string | null;
  arxivId?: string | null;
};

export type TypeInferenceSource = {
  title: string;
  abstract: string;
  tags: string[];
};

export type AutoContentTypes = {
  primary: ContentType | null;
  secondary: ContentType | null;
};

export type WorksheetFieldCarrier = {
  worksheetCitationText: string | null;
  worksheetSourceLink: string | null;
  contentTypePrimary: string | null;
  contentTypeSecondary: string | null;
  contentTypeOtherText: string | null;
  qualityScore: number | null;
  worksheetNote: string | null;
};

const strongBenchmarkTokens = ["benchmark", "benchmarking"];
const weakBenchmarkTokens = ["dataset", "corpus", "suite"];
const frameworkTokens = ["framework", "evaluation framework", "eval framework", "testing framework"];
const conceptualTokens = [
  "conceptual",
  "theoretical",
  "theory",
  "taxonomy",
  "survey",
  "perspective",
  "overview",
];
const evaluationTokens = [
  "evaluation",
  "evaluate",
  "assessment",
  "safety evaluation",
  "red team",
  "red teaming",
  "robustness",
  "audit",
];
const jailbreakTokens = ["jailbreak", "prompt injection"];
const rewardHackingTokens = ["reward hacking", "specification gaming"];
const alignmentFakingTokens = [
  "alignment faking",
  "deceptive",
  "deception",
  "sleeper agent",
  "sandbagging",
  "strategic compliance",
];
const redTeamingTokens = ["red team", "red teaming"];
const conditionalBehaviorTokens = ["conditional behavior", "conditional refusal"];
const promptGeneratorTokens = [
  "prompt generator",
  "prompt generation",
  "generated prompts",
  "query generator",
  "attack generator",
  "jailbreak generator",
];

function cleanText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function stripTrailingPeriod(value: string) {
  return value.replace(/\.+$/, "").trim();
}

function firstAuthorLastName(authors: string) {
  const firstAuthor = authors
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)[0];

  if (!firstAuthor) {
    return "Unknown";
  }

  const pieces = firstAuthor.split(/\s+/).filter(Boolean);
  return pieces[pieces.length - 1] ?? firstAuthor;
}

function lowerText(input: { title: string; abstract: string }) {
  return `${input.title}\n${input.abstract}`.toLowerCase();
}

function hasAnyToken(haystack: string, tokens: string[]) {
  return tokens.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return pattern.test(haystack);
  });
}

function hasTag(tags: string[], tagName: string) {
  return tags.some((tag) => tag.toLowerCase() === tagName.toLowerCase());
}

function normalizeArxivHttps(url: string) {
  return url.replace(/^http:\/\/(www\.)?arxiv\.org/i, "https://arxiv.org");
}

export function buildWorksheetCitationText(source: CitationSource) {
  const authorLabel = source.authors.includes(",")
    ? `${firstAuthorLastName(source.authors)} et al.`
    : firstAuthorLastName(source.authors);
  const title = stripTrailingPeriod(source.title);
  const venue = cleanText(source.venue);
  return `${authorLabel} (${source.year}). ${title}.${venue ? ` ${stripTrailingPeriod(venue)}.` : ""}`;
}

export function getPreferredWorksheetSourceLink(source: WorksheetLinkSource) {
  const doi = cleanText(source.doi);
  if (doi) {
    return `https://doi.org/${doi}`;
  }

  const doiUrl = cleanText(source.doiUrl);
  if (doiUrl) {
    return doiUrl;
  }

  const sourceUrl = normalizeArxivHttps(source.sourceUrl);
  if (sourceUrl.includes("openreview.net")) {
    return sourceUrl;
  }
  if (sourceUrl.includes("semanticscholar.org")) {
    return sourceUrl;
  }
  if (sourceUrl.includes("arxiv.org/abs/")) {
    return sourceUrl;
  }
  if (source.arxivId) {
    return `https://arxiv.org/abs/${source.arxivId}`;
  }
  return sourceUrl;
}

export function inferAutoContentTypes(source: TypeInferenceSource): AutoContentTypes {
  const haystack = lowerText(source);

  const strongBenchmarkMatch = hasAnyToken(haystack, strongBenchmarkTokens);
  const weakBenchmarkMatch = hasAnyToken(haystack, weakBenchmarkTokens);
  const frameworkMatch = hasAnyToken(haystack, frameworkTokens);
  const conceptualMatch = hasAnyToken(haystack, conceptualTokens);
  const evalMatch = hasAnyToken(haystack, evaluationTokens);

  const genericMatches: ContentType[] = [];
  if (strongBenchmarkMatch || (weakBenchmarkMatch && !frameworkMatch && !evalMatch)) {
    genericMatches.push("BENCHMARK");
  }
  if (frameworkMatch || evalMatch) {
    genericMatches.push("EVAL_FRAMEWORK");
  }
  if (
    conceptualMatch &&
    !strongBenchmarkMatch &&
    !weakBenchmarkMatch &&
    !frameworkMatch &&
    !evalMatch
  ) {
    genericMatches.push("CONCEPTUAL");
  }

  const specificMatches: ContentType[] = [];
  if (hasTag(source.tags, "Jailbreaks") || hasAnyToken(haystack, jailbreakTokens)) {
    specificMatches.push("JAILBREAK_STUDY");
  }
  if (hasTag(source.tags, "Reward Hacking") || hasAnyToken(haystack, rewardHackingTokens)) {
    specificMatches.push("REWARD_HACKING");
  }
  if (
    hasTag(source.tags, "Alignment Faking") ||
    hasTag(source.tags, "Deception") ||
    hasAnyToken(haystack, alignmentFakingTokens)
  ) {
    specificMatches.push("ALIGNMENT_FAKING");
  }
  if (hasAnyToken(haystack, redTeamingTokens)) {
    specificMatches.push("RED_TEAMING");
  }

  const approachMatches: ContentType[] = [];
  if (hasAnyToken(haystack, conditionalBehaviorTokens)) {
    approachMatches.push("CONDITIONAL_BEHAVIOR");
  }
  if (hasAnyToken(haystack, promptGeneratorTokens)) {
    approachMatches.push("PROMPT_ATTACK_GENERATOR");
  }
  if (
    specificMatches.filter((value, index, collection) => collection.indexOf(value) === index).length > 1 ||
    genericMatches.length > 1
  ) {
    approachMatches.push("MIXED");
  }

  const orderedGeneric = genericMatches.sort((left, right) => {
    const rank = (value: ContentType) =>
      value === ContentType.BENCHMARK
        ? 0
        : value === ContentType.EVAL_FRAMEWORK
          ? 1
          : value === ContentType.CONCEPTUAL
            ? 2
            : 3;
    return rank(left) - rank(right);
  });
  const orderedSpecific = specificMatches.filter(
    (value, index, collection) => collection.indexOf(value) === index,
  );
  const orderedApproach = approachMatches.filter(
    (value, index, collection) => collection.indexOf(value) === index,
  );

  if (orderedGeneric.length > 0) {
    return {
      primary: orderedGeneric[0],
      secondary: orderedSpecific[0] ?? orderedApproach[0] ?? null,
    };
  }

  return {
    primary: orderedSpecific[0] ?? orderedApproach[0] ?? null,
    secondary:
      orderedSpecific.length > 0
        ? orderedApproach[0] ?? null
        : orderedApproach.length > 1
          ? orderedApproach[1]
          : null,
  };
}

export function getContentTypeOptionLabel(contentType: ContentType | string) {
  switch (contentType) {
    case ContentType.EVAL_FRAMEWORK:
      return "Evaluation_Framework";
    case ContentType.PROMPT_ATTACK_GENERATOR:
      return "Prompt_Generator";
    default:
      return toDisplayCase(contentType);
  }
}

export function getExtractablePotentialOptionLabel(value: ExtractablePotential | string) {
  return toDisplayCase(value);
}

function getSingleContentTypeLabel(
  contentType: string | null,
  contentTypeOtherText?: string | null,
) {
  if (!contentType) {
    return "";
  }
  if (contentType === "OTHER") {
    return cleanText(contentTypeOtherText) ?? "";
  }
  return getContentTypeOptionLabel(contentType);
}

export function getContentTypeDisplayValue(
  contentTypePrimary: string | null,
  contentTypeSecondary?: string | null,
  contentTypeOtherText?: string | null,
) {
  const primary = getSingleContentTypeLabel(contentTypePrimary, contentTypeOtherText);
  const secondary = getSingleContentTypeLabel(contentTypeSecondary ?? null, contentTypeOtherText);

  if (primary && secondary) {
    return `${primary} + ${secondary}`;
  }
  return primary || secondary || "";
}

export function isWorksheetFieldMissing(paper: WorksheetFieldCarrier) {
  if (!cleanText(paper.worksheetCitationText)) {
    return true;
  }
  if (!cleanText(paper.worksheetSourceLink)) {
    return true;
  }
  if (!getContentTypeDisplayValue(paper.contentTypePrimary, paper.contentTypeSecondary, paper.contentTypeOtherText)) {
    return true;
  }
  if (
    (paper.contentTypePrimary === "OTHER" || paper.contentTypeSecondary === "OTHER") &&
    !cleanText(paper.contentTypeOtherText)
  ) {
    return true;
  }
  if (!cleanText(paper.worksheetNote)) {
    return true;
  }
  return false;
}

export function toWorksheetExportRow(paper: WorksheetFieldCarrier) {
  const columns = [
    cleanText(paper.worksheetCitationText) ?? "",
    cleanText(paper.worksheetSourceLink) ?? "",
    getContentTypeDisplayValue(
      paper.contentTypePrimary,
      paper.contentTypeSecondary,
      paper.contentTypeOtherText,
    ),
    "",
    paper.qualityScore == null ? "" : String(paper.qualityScore),
    "",
    cleanText(paper.worksheetNote) ?? "",
  ];

  return columns.join("\t");
}

export function normalizeInteger(
  value: number | string | null | undefined,
  min: number,
  max: number,
) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer between ${min} and ${max}.`);
  }

  return parsed;
}

export function normalizeOptionalString(value: string | null | undefined) {
  return cleanText(value);
}

export function stringifyLinksProvenance(value: LinkProvenance | null | undefined) {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

export function parseLinksProvenance(value: string | null | undefined): LinkProvenance | null {
  if (!value) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const nextValue: LinkProvenance = {};
  if (record.codeRepo === "api" || record.codeRepo === "manual") {
    nextValue.codeRepo = record.codeRepo;
  }
  if (record.dataset === "api" || record.dataset === "manual") {
    nextValue.dataset = record.dataset;
  }
  if (record.project === "api" || record.project === "manual") {
    nextValue.project = record.project;
  }

  return Object.keys(nextValue).length > 0 ? nextValue : null;
}
