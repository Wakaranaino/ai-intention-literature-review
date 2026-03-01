import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorksheetCitationText,
  getContentTypeOptionLabel,
  getContentTypeDisplayValue,
  getPreferredWorksheetSourceLink,
  inferAutoContentTypes,
  toWorksheetExportRow,
} from "../lib/curation";

test("buildWorksheetCitationText formats multi-author citation with venue", () => {
  const result = buildWorksheetCitationText({
    authors: "Jane Zhang, Alex Rivera, Priya Nair",
    year: 2025,
    title: "Paper Title",
    venue: "NeurIPS",
  });

  assert.equal(result, "Zhang et al. (2025). Paper Title. NeurIPS.");
});

test("buildWorksheetCitationText formats single-author citation without venue", () => {
  const result = buildWorksheetCitationText({
    authors: "Morgan Lee",
    year: 2024,
    title: "Careful Study.",
    venue: null,
  });

  assert.equal(result, "Lee (2024). Careful Study.");
});

test("getPreferredWorksheetSourceLink prefers DOI before other links and normalizes arxiv to https", () => {
  assert.equal(
    getPreferredWorksheetSourceLink({
      doi: "10.1234/example.1",
      doiUrl: null,
      sourceUrl: "https://www.semanticscholar.org/paper/example",
      arxivId: "2401.00001",
    }),
    "https://doi.org/10.1234/example.1",
  );

  assert.equal(
    getPreferredWorksheetSourceLink({
      doi: null,
      doiUrl: null,
      sourceUrl: "http://arxiv.org/abs/2401.00001",
      arxivId: "2401.00001",
    }),
    "https://arxiv.org/abs/2401.00001",
  );
});

test("getPreferredWorksheetSourceLink falls back to openreview then semantic scholar then arxiv", () => {
  assert.equal(
    getPreferredWorksheetSourceLink({
      doi: null,
      doiUrl: null,
      sourceUrl: "https://openreview.net/forum?id=abc123",
      arxivId: "2401.00001",
    }),
    "https://openreview.net/forum?id=abc123",
  );

  assert.equal(
    getPreferredWorksheetSourceLink({
      doi: null,
      doiUrl: null,
      sourceUrl: "https://www.semanticscholar.org/paper/example",
      arxivId: "2401.00001",
    }),
    "https://www.semanticscholar.org/paper/example",
  );

  assert.equal(
    getPreferredWorksheetSourceLink({
      doi: null,
      doiUrl: null,
      sourceUrl: "https://example.com/paper",
      arxivId: "2401.00001",
    }),
    "https://arxiv.org/abs/2401.00001",
  );
});

test("inferAutoContentTypes returns benchmark plus jailbreak topic", () => {
  const result = inferAutoContentTypes({
    title: "A benchmark suite for jailbreak robustness",
    abstract: "We evaluate prompt injection and jailbreak attacks against assistant models.",
    tags: ["Jailbreaks"],
  });

  assert.deepEqual(result, {
    primary: "BENCHMARK",
    secondary: "JAILBREAK_STUDY",
  });
});

test("inferAutoContentTypes defaults deception-style papers to alignment faking", () => {
  const result = inferAutoContentTypes({
    title: "Strategic compliance in sleeper agents",
    abstract: "We study deceptive behavior, sandbagging, and deceptive alignment in LLMs.",
    tags: ["Deception"],
  });

  assert.deepEqual(result, {
    primary: "ALIGNMENT_FAKING",
    secondary: null,
  });
});

test("inferAutoContentTypes prefers eval framework when framework language appears without strong benchmark signals", () => {
  const result = inferAutoContentTypes({
    title: "A framework for evaluating intent steering attacks",
    abstract:
      "We introduce an evaluation framework for jailbreak and prompt injection analysis using synthetic datasets.",
    tags: ["Jailbreaks"],
  });

  assert.deepEqual(result, {
    primary: "EVAL_FRAMEWORK",
    secondary: "JAILBREAK_STUDY",
  });
});

test("inferAutoContentTypes uses approach tier when topic is present but generic type is missing", () => {
  const result = inferAutoContentTypes({
    title: "Conditional refusal patterns in deceptive jailbreak behavior",
    abstract: "We study jailbreak behavior and conditional refusal in assistant models.",
    tags: ["Jailbreaks"],
  });

  assert.deepEqual(result, {
    primary: "JAILBREAK_STUDY",
    secondary: "CONDITIONAL_BEHAVIOR",
  });
});

test("inferAutoContentTypes identifies conceptual papers when no benchmark or framework signal appears", () => {
  const result = inferAutoContentTypes({
    title: "A conceptual taxonomy of strategic compliance in AI systems",
    abstract:
      "This paper presents a conceptual taxonomy and theoretical overview of strategic compliance and deceptive behavior.",
    tags: ["Deception"],
  });

  assert.deepEqual(result, {
    primary: "CONCEPTUAL",
    secondary: "ALIGNMENT_FAKING",
  });
});

test("toWorksheetExportRow preserves blank included and curated_by columns", () => {
  const row = toWorksheetExportRow({
    worksheetCitationText: "Zhang et al. (2025). Paper Title. NeurIPS.",
    worksheetSourceLink: "https://doi.org/10.1234/example.1",
    contentTypePrimary: "BENCHMARK",
    contentTypeSecondary: "JAILBREAK_STUDY",
    contentTypeOtherText: null,
    qualityScore: 8,
    worksheetNote: "One dense sentence.",
  });

  assert.equal(
    row,
    "Zhang et al. (2025). Paper Title. NeurIPS.\thttps://doi.org/10.1234/example.1\tBenchmark + Jailbreak_Study\t\t8\t\tOne dense sentence.",
  );
  assert.equal(
    getContentTypeDisplayValue("BENCHMARK", "JAILBREAK_STUDY", null),
    "Benchmark + Jailbreak_Study",
  );
  assert.equal(getContentTypeOptionLabel("PROMPT_ATTACK_GENERATOR"), "Prompt_Generator");
  assert.equal(getContentTypeDisplayValue("EVAL_FRAMEWORK", null, null), "Evaluation_Framework");
});
