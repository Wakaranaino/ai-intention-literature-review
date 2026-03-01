import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { buildDateWindows } from "../lib/backfill";
import { envDate, resetArxivThrottleState, runIngestRange } from "../lib/ingest-runner";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const startDate = envDate("BACKFILL_START_DATE", new Date("2023-01-01T00:00:00.000Z"), [
    "ARXIV_DATE_FROM",
  ]);
  const endDate = envDate("BACKFILL_END_DATE", now, ["ARXIV_DATE_TO"]);
  const sliceDays = Number.parseInt(process.env.BACKFILL_SLICE_DAYS ?? "7", 10);
  const maxResults = Number.parseInt(
    process.env.ARXIV_MAX_RESULTS ?? process.env.BACKFILL_PAGE_SIZE ?? "50",
    10,
  );
  const maxPagesPerSliceRaw = process.env.BACKFILL_MAX_PAGES_PER_SLICE;
  const maxPagesPerSlice =
    maxPagesPerSliceRaw == null || maxPagesPerSliceRaw === ""
      ? null
      : Number.parseInt(maxPagesPerSliceRaw, 10);

  const windows = buildDateWindows(startDate, endDate, sliceDays);
  console.log(
    `Backfilling ${windows.length} windows from ${startDate.toISOString().slice(0, 10)} to ${endDate
      .toISOString()
      .slice(0, 10)} with ${sliceDays}-day slices...`,
  );

  resetArxivThrottleState();

  let skipped = 0;
  let created = 0;
  let updated = 0;

  for (const [index, window] of windows.entries()) {
    const existingWindow = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "IngestWindow"
      WHERE "mode" = ${"BACKFILL"}
        AND "startDate" = ${window.startDate}
        AND "endDate" = ${window.endDate}
      LIMIT 1
    `;

    if (existingWindow.length > 0) {
      skipped += 1;
      console.log(
        `Skipping backfill window ${index + 1}/${windows.length}: ${window.startDate
          .toISOString()
          .slice(0, 10)} to ${window.endDate.toISOString().slice(0, 10)} already completed.`,
      );
      continue;
    }

    const summary = await runIngestRange({
      prisma,
      startDate: window.startDate,
      endDate: window.endDate,
      maxResults,
      maxPages: maxPagesPerSlice,
      logPrefix: `[Window ${index + 1}/${windows.length}]`,
    });

    await prisma.$executeRaw`
      INSERT INTO "IngestWindow" ("id", "mode", "startDate", "endDate")
      VALUES (${randomUUID()}, ${"BACKFILL"}, ${window.startDate}, ${window.endDate})
    `;

    created += summary.created;
    updated += summary.updated;
  }

  console.log(
    `Backfill complete: ${created} created, ${updated} updated, ${skipped} windows skipped.`,
  );
}

main()
  .catch((error) => {
    console.error("Backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
