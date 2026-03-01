import test from "node:test";
import assert from "node:assert/strict";

import {
  extractPaperReferenceCandidate,
  normalizePaperKeyFromPaper,
  normalizePaperKeyFromUrl,
} from "../lib/paper-keys";
import { parseExcludedPaperLines } from "../lib/excluded-papers";

test("normalizePaperKeyFromUrl prefers DOI keys", () => {
  assert.deepEqual(
    normalizePaperKeyFromUrl("https://doi.org/10.1234/Example.5"),
    {
      key: "doi:10.1234/example.5",
      sourceUrl: "https://doi.org/10.1234/example.5",
    },
  );
});

test("normalizePaperKeyFromUrl normalizes arxiv ids and strips version suffixes", () => {
  assert.deepEqual(
    normalizePaperKeyFromUrl("https://arxiv.org/pdf/2602.22983v2.pdf"),
    {
      key: "arxiv:2602.22983",
      sourceUrl: "https://arxiv.org/abs/2602.22983",
    },
  );
});

test("normalizePaperKeyFromUrl extracts openreview ids", () => {
  assert.deepEqual(
    normalizePaperKeyFromUrl("https://openreview.net/forum?id=gNvU08xR3W"),
    {
      key: "openreview:gNvU08xR3W",
      sourceUrl: "https://openreview.net/forum?id=gNvU08xR3W",
    },
  );
});

test("normalizePaperKeyFromPaper uses metadata priority order", () => {
  assert.equal(
    normalizePaperKeyFromPaper({
      doi: "10.5555/XYZ",
      arxivId: "2602.22983",
      sourceUrl: "https://arxiv.org/abs/2602.22983",
    }),
    "doi:10.5555/xyz",
  );

  assert.equal(
    normalizePaperKeyFromPaper({
      doi: null,
      arxivId: "2602.22983v1",
      sourceUrl: "https://arxiv.org/abs/2602.22983v1",
    }),
    "arxiv:2602.22983",
  );
});

test("extractPaperReferenceCandidate pulls the first URL from TSV-like lines", () => {
  assert.equal(
    extractPaperReferenceCandidate(
      "Zhang et al.\thttps://openreview.net/forum?id=gNvU08xR3W\tBENCHMARK",
    ),
    "https://openreview.net/forum?id=gNvU08xR3W",
  );
});

test("parseExcludedPaperLines reports invalid rows and keeps first valid URL per line", () => {
  const result = parseExcludedPaperLines([
    "https://arxiv.org/abs/2602.22983v1",
    "Paper\tignored\thttps://doi.org/10.1234/Test.9\tNote",
    "not a link",
  ].join("\n"));

  assert.deepEqual(result.validEntries, [
    {
      key: "arxiv:2602.22983",
      sourceUrl: "https://arxiv.org/abs/2602.22983",
    },
    {
      key: "doi:10.1234/test.9",
      sourceUrl: "https://doi.org/10.1234/test.9",
    },
  ]);
  assert.deepEqual(result.invalidLines, ["not a link"]);
});
