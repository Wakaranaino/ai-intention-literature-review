import test from "node:test";
import assert from "node:assert/strict";

import {
  buildArxivKeywordClause,
  buildArxivSearchQuery,
  getArxivSuccessSpacingDelayMs,
  resolveArxivQueryConfigs,
} from "../lib/ingest-runner";

test("buildArxivKeywordClause applies each term to both title and abstract", () => {
  assert.equal(
    buildArxivKeywordClause(["alignment", "alignment faking"]),
    '((ti:alignment OR abs:alignment) OR (ti:"alignment faking" OR abs:"alignment faking"))',
  );
});

test("buildArxivSearchQuery combines categories, date range, and keyword clause", () => {
  const query = buildArxivSearchQuery({
    categories: "cs.AI,cs.CL",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-01-03T23:59:59.999Z"),
    terms: ["jailbreak", "reward hacking"],
  });

  assert.equal(
    query,
    '(cat:cs.AI OR cat:cs.CL) AND submittedDate:[202601010000 TO 202601032359] AND ((ti:jailbreak OR abs:jailbreak) OR (ti:"reward hacking" OR abs:"reward hacking"))',
  );
});

test("resolveArxivQueryConfigs flattens terms and groups into one single-mode query", () => {
  const result = resolveArxivQueryConfigs({
    mode: "single",
    terms: 'alignment,"reward hacking"',
    groups: 'jailbreak,"prompt injection"||alignment,deceptive',
  });

  assert.equal(result.mode, "single");
  assert.equal(result.configs.length, 1);
  assert.deepEqual(result.configs[0]?.terms, [
    "alignment",
    "reward hacking",
    "jailbreak",
    "prompt injection",
    "deceptive",
  ]);
});

test("resolveArxivQueryConfigs keeps separate groups in grouped mode", () => {
  const result = resolveArxivQueryConfigs({
    mode: "grouped",
    groups: 'alignment,deceptive||jailbreak,"prompt injection"',
  });

  assert.equal(result.mode, "grouped");
  assert.equal(result.configs.length, 2);
  assert.deepEqual(result.configs[0]?.terms, ["alignment", "deceptive"]);
  assert.deepEqual(result.configs[1]?.terms, ["jailbreak", "prompt injection"]);
});

test("resolveArxivQueryConfigs defaults to single mode with behavior-only query terms", () => {
  const result = resolveArxivQueryConfigs({});

  assert.equal(result.mode, "single");
  assert.equal(result.configs.length, 1);
  assert.deepEqual(result.configs[0]?.terms, [
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
  ]);
});

test("getArxivSuccessSpacingDelayMs enforces spacing across successful requests", () => {
  assert.equal(getArxivSuccessSpacingDelayMs(0, 10_000, 20_000), 0);
  assert.equal(getArxivSuccessSpacingDelayMs(10_000, 10_000, 12_000), 8_000);
  assert.equal(getArxivSuccessSpacingDelayMs(10_000, 10_000, 21_000), 0);
});
