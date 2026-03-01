import { getAppMode } from "./app-mode";

export type LocalModelSettings = {
  baseUrl: string;
  model?: string | null;
};

export type AICurationDraft = {
  qualityScore: number | null;
  relevanceScore: number | null;
  extractablePotential: "DIRECT" | "ADAPTABLE" | "NOT" | "UNKNOWN";
  notes: string | null;
  studyLink: string | null;
};

type OpenAIModelListResponse = {
  data?: Array<{ id?: string }>;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function requireLocalMode() {
  if (getAppMode() !== "local") {
    throw new Error("AI generation is disabled in hosted mode.");
  }
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Base URL is required.");
  }
  return trimmed;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError" || /timeout/i.test(error.message)) {
      return "Connection timed out while reaching the local model endpoint.";
    }
    if (/fetch failed/i.test(error.message) || /ECONNREFUSED/i.test(error.message)) {
      return "Local model endpoint is unreachable. Check that the server is running and the Base URL is correct.";
    }
    return error.message;
  }
  return "Unknown local model error.";
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    return response;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

function extractMessageContent(response: OpenAIChatResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (item.type === "text" ? item.text ?? "" : ""))
      .join("")
      .trim();
  }
  throw new Error("Local model returned no message content.");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  throw new Error("Local model response did not contain valid JSON.");
}

function repairCommonJsonIssues(text: string) {
  return text
    .replace(
      /("extractablePotential"\s*:\s*)(DIRECT|ADAPTABLE|NOT|UNKNOWN)(\s*[,}])/g,
      '$1"$2"$3',
    )
    .replace(/(:\s*)(DIRECT|ADAPTABLE|NOT|UNKNOWN)(\s*[,}])/g, '$1"$2"$3')
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");
}

function parseFieldValue(raw: string) {
  const trimmed = raw.trim().replace(/,\s*$/, "");
  if (trimmed === "null") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isLikelyMeaningfulNote(value: string | null) {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length < 12) {
    return false;
  }
  return /[a-z]{3,}/i.test(trimmed);
}

function parseKnownAICurationFields(text: string) {
  const expectedKeys = [
    "qualityScore",
    "relevanceScore",
    "extractablePotential",
    "notes",
    "studyLink",
  ] as const;

  const parsedEntries = expectedKeys.flatMap((key) => {
    const pattern =
      key === "notes" || key === "studyLink"
        ? new RegExp(`"${key}"\\s*:\\s*("([^"\\\\]|\\\\.|\\n)*"|'([^'\\\\]|\\\\.|\\n)*'|null)`)
        : new RegExp(`"${key}"\\s*:\\s*("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*'|null|true|false|-?\\d+(?:\\.\\d+)?|[A-Z_]+)`);
    const match = text.match(pattern);
    return match ? ([[key, parseFieldValue(match[1])] as const]) : [];
  });

  if (parsedEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(parsedEntries);
}

export function parseAICurationJson(text: string) {
  const jsonText = extractJsonObject(text);

  try {
    return JSON.parse(jsonText) as unknown;
  } catch (error) {
    const repaired = repairCommonJsonIssues(jsonText);
    try {
      return JSON.parse(repaired) as unknown;
    } catch {
      const parsed = parseKnownAICurationFields(repaired);
      if (parsed) {
        return parsed;
      }
      throw error;
    }
  }
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeComparableUrl(value: string | null | undefined) {
  const nextValue = normalizeNullableString(value);
  if (!nextValue) {
    return null;
  }

  try {
    const url = new URL(nextValue);
    url.protocol = "https:";
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeScore(value: unknown, min: number, max: number) {
  if (value == null || value === "") {
    return null;
  }
  const parsed =
    typeof value === "number"
      ? value
      : (() => {
          const normalized = String(value).trim();
          const matched = normalized.match(/-?\d+(?:\.\d+)?/);
          return matched ? Number.parseFloat(matched[0]) : Number.NaN;
        })();
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return Math.round(parsed);
}

export function sanitizeAIGeneratedStudyLink(
  value: unknown,
  paperLinks: {
    sourceUrl?: string | null;
    pdfUrl?: string | null;
    doiUrl?: string | null;
    arxivId?: string | null;
  },
) {
  const nextValue = normalizeNullableString(value);
  if (!nextValue) {
    return null;
  }

  if (/^(unknown|none|n\/a|null|not available)$/i.test(nextValue)) {
    return null;
  }

  const normalizedCandidate = normalizeComparableUrl(nextValue);
  if (!normalizedCandidate) {
    return nextValue;
  }

  const blockedLinks = new Set(
    [
      paperLinks.sourceUrl,
      paperLinks.pdfUrl,
      paperLinks.doiUrl,
      paperLinks.arxivId ? `https://arxiv.org/abs/${paperLinks.arxivId}` : null,
      paperLinks.arxivId ? `https://arxiv.org/pdf/${paperLinks.arxivId}.pdf` : null,
    ]
      .map((link) => normalizeComparableUrl(link ?? null))
      .filter((link): link is string => Boolean(link)),
  );

  if (blockedLinks.has(normalizedCandidate)) {
    return null;
  }

  const candidateHost = new URL(normalizedCandidate).hostname.replace(/^www\./, "");
  if (
    candidateHost === "arxiv.org" ||
    candidateHost === "doi.org" ||
    candidateHost === "openreview.net" ||
    candidateHost === "semanticscholar.org"
  ) {
    return null;
  }

  return normalizedCandidate;
}

function normalizeAICurationDraft(
  raw: unknown,
  paper: {
    title: string;
    tags: string[];
  },
  paperLinks: Parameters<typeof sanitizeAIGeneratedStudyLink>[1],
): AICurationDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Local model JSON draft was malformed.");
  }

  const record = raw as Record<string, unknown>;
  const extractablePotential =
    record.extractablePotential === "DIRECT" ||
    record.extractablePotential === "ADAPTABLE" ||
    record.extractablePotential === "NOT" ||
    record.extractablePotential === "UNKNOWN"
      ? record.extractablePotential
      : "UNKNOWN";

  const note = (() => {
    const candidate = normalizeNullableString(record.notes);
    return isLikelyMeaningfulNote(candidate) ? candidate : null;
  })();

  return {
    qualityScore: normalizeScore(record.qualityScore, 1, 10),
    relevanceScore: normalizeScore(record.relevanceScore, 0, 10),
    extractablePotential,
    notes: note ?? buildFallbackWorksheetNote(paper, extractablePotential),
    studyLink: sanitizeAIGeneratedStudyLink(record.studyLink, paperLinks),
  };
}

function buildFallbackWorksheetNote(
  paper: {
    title: string;
    tags: string[];
  },
  extractablePotential: AICurationDraft["extractablePotential"],
) {
  const lowerTags = paper.tags.map((tag) => tag.toLowerCase());
  const topicLabel = lowerTags.includes("alignment faking")
    ? "alignment faking"
    : lowerTags.includes("ai intentions")
      ? "AI intentions"
      : lowerTags.includes("deception")
        ? "deceptive or strategic AI behavior"
        : lowerTags.includes("jailbreaks")
          ? "jailbreak-related behavior"
          : lowerTags.includes("reward hacking")
            ? "reward hacking behavior"
            : "AI intentions-related behavior";

  const extractabilityClause =
    extractablePotential === "DIRECT"
      ? "the abstract suggests directly reusable prompts, queries, or benchmark items"
      : extractablePotential === "ADAPTABLE"
        ? "the abstract suggests methods or patterns that could be adapted into reusable question sets"
        : extractablePotential === "NOT"
          ? "the abstract does not clearly provide reusable question sets for this workflow"
          : "the abstract does not make question-set availability clear";

  return `This paper is relevant to ${topicLabel}, and ${extractabilityClause}.`;
}

export async function fetchLocalModels(settings: LocalModelSettings) {
  requireLocalMode();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const response = await fetchWithTimeout(`${baseUrl}/models`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models (${response.status}).`);
  }

  const payload = (await response.json()) as OpenAIModelListResponse;
  return (payload.data ?? [])
    .map((model) => model.id?.trim())
    .filter((model): model is string => Boolean(model));
}

async function resolveModel(settings: LocalModelSettings) {
  const configuredModel = settings.model?.trim();
  if (configuredModel) {
    return configuredModel;
  }

  const models = await fetchLocalModels(settings);
  if (models.length === 0) {
    throw new Error("No models were returned by the local endpoint. Enter a model name manually.");
  }
  return models[0];
}

async function chatCompletion(
  settings: LocalModelSettings,
  payload: Record<string, unknown>,
) {
  requireLocalMode();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText
        ? `Local model request failed (${response.status}): ${errorText}`
        : `Local model request failed (${response.status}).`,
    );
  }

  return (await response.json()) as OpenAIChatResponse;
}

export async function testLocalModelConnection(settings: LocalModelSettings) {
  const model = await resolveModel(settings);
  const response = await chatCompletion(settings, {
    model,
    temperature: 0,
    max_tokens: 8,
    messages: [
      {
        role: "system",
        content: "Reply with the single token OK.",
      },
      {
        role: "user",
        content: "Connection test",
      },
    ],
  });

  return {
    model,
    reply: extractMessageContent(response),
  };
}

export async function generateLocalCurationDraft(
  settings: LocalModelSettings,
  paper: {
    paperId?: string;
    title: string;
    abstract: string;
    authors: string;
    year: number;
    venue?: string | null;
    tags: string[];
    sourceUrl: string;
    pdfUrl: string;
    doiUrl?: string | null;
    arxivId?: string | null;
  },
) {
  const model = await resolveModel(settings);
  const response = await chatCompletion(settings, {
    model,
    temperature: 0.1,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You are generating curation metadata for a research worksheet. Use only the provided title, abstract, tags, and metadata. Return strict JSON only with keys qualityScore, relevanceScore, extractablePotential, notes, studyLink. Notes must be one dense sentence and should never be null or empty. qualityScore means the paper's research/publication quality, not worksheet usefulness: methodological rigor, clarity of contribution, strength of evidence, and publication signal if explicitly provided. Use normal judgment from the available evidence in the abstract and metadata; do not hallucinate missing facts. In normal cases, provide a 1-10 quality score rather than null. Use null only when the abstract is too vague or too missing to support even a rough research-quality judgment. relevanceScore means relevance specifically to AI intentions and alignment faking, not broad AI safety or general importance. Score 9-10 only when the paper is centrally about AI intentions, deceptive alignment, alignment faking, strategic compliance, hidden goals, or closely related intentional-behavior questions in AI systems. Score 6-8 when the paper is clearly related but more indirect, such as jailbreaks, prompt injection, reward hacking, or evaluation work that materially informs AI intentions/alignment-faking research. Score 3-5 for adjacent safety, robustness, or red-teaming work that is useful background but not mainly about AI intentions or alignment faking. Score 0-2 for weakly related papers. Do not default to 9 just because the paper passed filtering. extractablePotential means extractable question-set potential for an AI intentions / alignment-faking question bank, not general artifact release. Use DIRECT when the abstract indicates the paper includes or releases clearly usable prompts, queries, question sets, jailbreak sets, benchmark items, evaluation tasks, or other testable inputs that can be directly reused to probe intentions, strategic behavior, refusal, deception, or alignment-faking related behavior. Use ADAPTABLE when the paper contains methods, attack strategies, harmful-query patterns, or evaluation setups that could be adapted into such questions, but does not clearly provide a directly reusable question set. Use NOT when the work mainly releases a model, reports results, or provides artifacts that do not imply reusable questions for this purpose. Use UNKNOWN when the abstract does not say enough to judge. studyLink may be either a distinct project/code/dataset/demo/study URL or a short plain-text artifact note such as 'mentions released jailbreak prompts' or 'benchmark questions referenced in abstract'. Never reuse DOI, arXiv, OpenReview, Semantic Scholar, sourceUrl, or pdfUrl as studyLink. If no distinct artifact page or artifact-note signal is indicated, return null for studyLink. Do not hallucinate facts or links.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            paperId: paper.paperId ?? null,
            title: paper.title,
            abstract: paper.abstract,
            authors: paper.authors,
            year: paper.year,
            venue: paper.venue ?? null,
            tags: paper.tags,
            sourceUrl: paper.sourceUrl,
            pdfUrl: paper.pdfUrl,
            doiUrl: paper.doiUrl ?? null,
            arxivId: paper.arxivId ?? null,
          },
          null,
          2,
        ),
      },
    ],
  });

  const text = extractMessageContent(response);
  const parsed = parseAICurationJson(text);
  return {
    model,
    draft: normalizeAICurationDraft(
      parsed,
      {
        title: paper.title,
        tags: paper.tags,
      },
      {
      sourceUrl: paper.sourceUrl,
      pdfUrl: paper.pdfUrl,
      doiUrl: paper.doiUrl ?? null,
      arxivId: paper.arxivId ?? null,
      },
    ),
  };
}
