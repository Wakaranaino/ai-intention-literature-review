import { readFile } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

export type IngestKeywordConfig = {
  domainKeywords: string[];
  behaviorKeywords: string[];
};

export type IngestKeywordMatch = {
  domainMatches: string[];
  behaviorMatches: string[];
};

function normalizeKeywordList(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

export async function loadIngestKeywords(filePath?: string): Promise<IngestKeywordConfig> {
  const resolvedPath =
    filePath ?? process.env.INGEST_KEYWORDS_PATH ?? path.join(process.cwd(), "ingest_keywords.yaml");
  const contents = await readFile(resolvedPath, "utf8");
  const parsed = YAML.parse(contents) as unknown;

  if (Array.isArray(parsed)) {
    return {
      domainKeywords: [],
      behaviorKeywords: normalizeKeywordList(parsed),
    };
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Expected a YAML object in ${resolvedPath}`);
  }

  const record = parsed as Record<string, unknown>;
  const config = {
    domainKeywords: normalizeKeywordList(record.domain_keywords),
    behaviorKeywords: normalizeKeywordList(record.behavior_keywords),
  };

  if (config.behaviorKeywords.length === 0) {
    throw new Error(`No behavior keywords configured in ${resolvedPath}`);
  }

  return config;
}

function findMatches(
  paper: { title: string; abstract: string },
  keywords: string[],
) {
  const haystack = `${paper.title}\n${paper.abstract}`.toLowerCase();

  return keywords
    .filter((keyword) => haystack.includes(keyword.toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}

export function findMatchedKeywords(
  paper: { title: string; abstract: string },
  config: IngestKeywordConfig,
): IngestKeywordMatch {
  return {
    domainMatches: findMatches(paper, config.domainKeywords),
    behaviorMatches: findMatches(paper, config.behaviorKeywords),
  };
}

export function matchesAnyKeyword(
  paper: { title: string; abstract: string },
  config: IngestKeywordConfig,
): boolean {
  const matches = findMatchedKeywords(paper, config);
  const hasBehaviorMatch = matches.behaviorMatches.length > 0;
  const hasDomainMatch =
    config.domainKeywords.length === 0 ? true : matches.domainMatches.length > 0;

  return hasDomainMatch && hasBehaviorMatch;
}
