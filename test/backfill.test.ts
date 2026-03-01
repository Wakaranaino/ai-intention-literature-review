import test from "node:test";
import assert from "node:assert/strict";

import { buildDateWindows } from "../lib/backfill";

test("buildDateWindows creates contiguous bounded slices", () => {
  const windows = buildDateWindows(
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2026-01-10T23:59:59.999Z"),
    4,
  );

  assert.equal(windows.length, 3);
  assert.equal(windows[0]?.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(windows[0]?.endDate.toISOString(), "2026-01-04T23:59:59.999Z");
  assert.equal(windows[1]?.startDate.toISOString(), "2026-01-05T00:00:00.000Z");
  assert.equal(windows[1]?.endDate.toISOString(), "2026-01-08T23:59:59.999Z");
  assert.equal(windows[2]?.startDate.toISOString(), "2026-01-09T00:00:00.000Z");
  assert.equal(windows[2]?.endDate.toISOString(), "2026-01-10T23:59:59.999Z");
});
