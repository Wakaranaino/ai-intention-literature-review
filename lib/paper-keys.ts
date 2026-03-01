import { createHash } from "node:crypto";

type PaperKeyResult = {
  key: string;
  sourceUrl: string;
};

type PaperKeySource = {
  doi?: string | null;
  doiUrl?: string | null;
  sourceUrl?: string | null;
  arxivId?: string | null;
  semanticScholarId?: string | null;
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
]);

function cleanText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[),.;]+$/g, "");
}

function normalizeDoi(value: string) {
  return value
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase();
}

function extractDoi(value: string) {
  const normalized = stripTrailingPunctuation(value.trim());
  const doiPattern =
    /(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i;
  const matched = normalized.match(doiPattern);
  if (matched?.[1]) {
    return normalizeDoi(matched[1]);
  }

  if (/^10\.\d{4,9}\//i.test(normalized)) {
    return normalizeDoi(normalized);
  }

  return null;
}

function normalizeArxivId(value: string) {
  return value.trim().replace(/\.pdf$/i, "").replace(/v\d+$/i, "").toLowerCase();
}

function extractArxivId(value: string) {
  const directId = cleanText(value);
  if (directId && /^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/i.test(directId)) {
    return normalizeArxivId(directId);
  }

  const matched = value.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+?)(?:\.pdf)?(?:[?#].*)?$/i);
  if (matched?.[1]) {
    return normalizeArxivId(matched[1]);
  }

  return null;
}

function extractOpenReviewId(value: string) {
  try {
    const url = new URL(value);
    if (!/openreview\.net$/i.test(url.hostname)) {
      return null;
    }

    const queryId = url.searchParams.get("id");
    if (queryId) {
      return queryId.trim();
    }

    const matched = url.pathname.match(/\/(?:forum|pdf|attachment|note)\b/i);
    if (!matched) {
      return null;
    }

    return url.searchParams.get("noteId")?.trim() ?? null;
  } catch {
    return null;
  }
}

function extractSemanticScholarId(value: string) {
  const matched =
    value.match(/semanticscholar\.org\/paper\/[^/]+\/([a-f0-9]{20,})/i) ??
    value.match(/semanticscholar\.org\/paper\/([a-f0-9]{20,})/i);
  return matched?.[1]?.toLowerCase() ?? null;
}

function normalizeUrlForFallback(value: string) {
  try {
    const parsed = new URL(value.trim());
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    for (const param of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(param.toLowerCase())) {
        parsed.searchParams.delete(param);
      }
    }

    parsed.hash = "";

    const serialized = parsed.toString().replace(/\/+$/, "");
    return serialized;
  } catch {
    return stripTrailingPunctuation(value.trim()).replace(/\/+$/, "");
  }
}

export function findFirstUrlLikeSubstring(line: string) {
  const matched = line.match(/https?:\/\/[^\s\t<>"']+/i);
  return matched?.[0] ?? null;
}

export function extractPaperReferenceCandidate(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const urlCandidate = findFirstUrlLikeSubstring(trimmed);
  if (urlCandidate) {
    return urlCandidate;
  }

  const doiCandidate = trimmed.match(/(?:doi:\s*|^)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (doiCandidate?.[1]) {
    return doiCandidate[0].startsWith("10.") ? doiCandidate[1] : doiCandidate[0];
  }

  return null;
}

export function normalizePaperKeyFromUrl(rawValue: string): PaperKeyResult {
  const rawTrimmed = rawValue.trim();
  const candidate = findFirstUrlLikeSubstring(rawTrimmed) ?? rawTrimmed;

  const doi = extractDoi(candidate);
  if (doi) {
    return {
      key: `doi:${doi}`,
      sourceUrl: `https://doi.org/${doi}`,
    };
  }

  const arxivId = extractArxivId(candidate);
  if (arxivId) {
    return {
      key: `arxiv:${arxivId}`,
      sourceUrl: `https://arxiv.org/abs/${arxivId}`,
    };
  }

  const openReviewId = extractOpenReviewId(candidate);
  if (openReviewId) {
    return {
      key: `openreview:${openReviewId}`,
      sourceUrl: candidate.trim(),
    };
  }

  const semanticScholarId = extractSemanticScholarId(candidate);
  if (semanticScholarId) {
    return {
      key: `s2:${semanticScholarId}`,
      sourceUrl: candidate.trim(),
    };
  }

  const normalizedUrl = normalizeUrlForFallback(candidate);
  const hashedUrl = createHash("sha256").update(normalizedUrl).digest("hex");
  return {
    key: `url:${hashedUrl}`,
    sourceUrl: normalizedUrl,
  };
}

export function normalizePaperKeyFromPaper(source: PaperKeySource): string | null {
  const doi = cleanText(source.doi);
  if (doi) {
    return `doi:${normalizeDoi(doi)}`;
  }

  const doiUrl = cleanText(source.doiUrl);
  if (doiUrl) {
    return normalizePaperKeyFromUrl(doiUrl).key;
  }

  const arxivId = cleanText(source.arxivId);
  if (arxivId) {
    return `arxiv:${normalizeArxivId(arxivId)}`;
  }

  const sourceUrl = cleanText(source.sourceUrl);
  if (sourceUrl) {
    const openReviewId = extractOpenReviewId(sourceUrl);
    if (openReviewId) {
      return `openreview:${openReviewId}`;
    }

    const semanticScholarId = cleanText(source.semanticScholarId) ?? extractSemanticScholarId(sourceUrl);
    if (semanticScholarId) {
      return `s2:${semanticScholarId.toLowerCase()}`;
    }

    return normalizePaperKeyFromUrl(sourceUrl).key;
  }

  const semanticScholarId = cleanText(source.semanticScholarId);
  if (semanticScholarId) {
    return `s2:${semanticScholarId.toLowerCase()}`;
  }

  return null;
}
