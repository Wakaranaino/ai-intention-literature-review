import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAICurationJson,
  sanitizeAIGeneratedStudyLink,
  generateLocalCurationDraft,
} from "../lib/local-ai";

test("sanitizeAIGeneratedStudyLink drops duplicated paper links and unknown placeholders", () => {
  const paperLinks = {
    sourceUrl: "https://openreview.net/forum?id=abc123",
    pdfUrl: "https://arxiv.org/pdf/2501.00001.pdf",
    doiUrl: "https://doi.org/10.1234/example.1",
    arxivId: "2501.00001",
  };

  assert.equal(
    sanitizeAIGeneratedStudyLink("https://openreview.net/forum?id=abc123", paperLinks),
    null,
  );
  assert.equal(
    sanitizeAIGeneratedStudyLink("https://doi.org/10.1234/example.1", paperLinks),
    null,
  );
  assert.equal(sanitizeAIGeneratedStudyLink("unknown", paperLinks), null);
});

test("sanitizeAIGeneratedStudyLink keeps distinct project pages", () => {
  const result = sanitizeAIGeneratedStudyLink("http://project.example.com/demo", {
    sourceUrl: "https://openreview.net/forum?id=abc123",
    pdfUrl: "https://arxiv.org/pdf/2501.00001.pdf",
    doiUrl: null,
    arxivId: "2501.00001",
  });

  assert.equal(result, "https://project.example.com/demo");
});

test("sanitizeAIGeneratedStudyLink keeps plain-text artifact notes", () => {
  const result = sanitizeAIGeneratedStudyLink("mentions released dataset and project page", {
    sourceUrl: "https://openreview.net/forum?id=abc123",
    pdfUrl: "https://arxiv.org/pdf/2501.00001.pdf",
    doiUrl: null,
    arxivId: "2501.00001",
  });

  assert.equal(result, "mentions released dataset and project page");
});

test("parseAICurationJson repairs bare enum tokens in near-JSON model output", () => {
  const parsed = parseAICurationJson(`{
    "qualityScore": 7,
    "relevanceScore": 8,
    "extractablePotential": DIRECT,
    "notes": "Introduces a benchmark and reports released artifacts.",
    "studyLink": "mentions released dataset"
  }`) as Record<string, unknown>;

  assert.equal(parsed.extractablePotential, "DIRECT");
  assert.equal(parsed.qualityScore, 7);
});

test("parseAICurationJson repairs bare enum tokens even when formatting is looser", () => {
  const parsed = parseAICurationJson(`Here is the result:
  {
    "qualityScore": "6/10",
    "relevanceScore": 5,
    "extractablePotential": NOT,
    "notes": "The paper is related but does not clearly provide reusable question sets.",
    "studyLink": null,
  }`) as Record<string, unknown>;

  assert.equal(parsed.extractablePotential, "NOT");
  assert.equal(parsed.qualityScore, "6/10");
});

test("parseAICurationJson falls back to field extraction when malformed JSON still cannot parse", () => {
  const parsed = parseAICurationJson(`{
    "qualityScore": 8,
    "relevanceScore": 6,
    "extractablePotential": NOT,
    "notes": "The paper is related but does not provide a direct question bank.",
    "studyLink": null,,,
  }`) as Record<string, unknown>;

  assert.equal(parsed.extractablePotential, "NOT");
  assert.equal(parsed.relevanceScore, 6);
  assert.equal(parsed.notes, "The paper is related but does not provide a direct question bank.");
});

test("parseAICurationJson can recover a full notes string from malformed JSON-like output", () => {
  const parsed = parseAICurationJson(`{
    "qualityScore": 9,
    "relevanceScore": 8,
    "extractablePotential": ADAPTABLE,
    "notes": "The paper is strongly related to AI intentions but does not clearly release reusable question sets.",
    "studyLink": null,,,,
  }`) as Record<string, unknown>;

  assert.equal(
    parsed.notes,
    "The paper is strongly related to AI intentions but does not clearly release reusable question sets.",
  );
});

test("generateLocalCurationDraft backfills a deterministic note when the model omits notes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `{
                "qualityScore": 8,
                "relevanceScore": 7,
                "extractablePotential": "ADAPTABLE",
                "notes": null,
                "studyLink": null
              }`,
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

  try {
    const result = await generateLocalCurationDraft(
      { baseUrl: "http://localhost:1234/v1", model: "test-model" },
      {
        title: "Prompt injection defenses for agentic systems",
        abstract: "We study prompt injection and release an evaluation setup.",
        authors: "A. Author",
        year: 2026,
        venue: null,
        tags: ["AI Intentions", "Jailbreaks"],
        sourceUrl: "https://arxiv.org/abs/2601.00001",
        pdfUrl: "https://arxiv.org/pdf/2601.00001.pdf",
        doiUrl: null,
        arxivId: "2601.00001",
      },
    );

    assert.equal(
      result.draft.notes,
      "This paper is relevant to AI intentions, and the abstract suggests methods or patterns that could be adapted into reusable question sets.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
