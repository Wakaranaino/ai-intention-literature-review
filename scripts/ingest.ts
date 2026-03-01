import { PrismaClient } from "@prisma/client";

import { envDate, resetArxivThrottleState, runIngestRange } from "../lib/ingest-runner";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startDate = envDate("INGEST_START_DATE", defaultStart, ["ARXIV_DATE_FROM"]);
  const endDate = envDate("INGEST_END_DATE", now, ["ARXIV_DATE_TO"]);

  resetArxivThrottleState();

  const summary = await runIngestRange({
    prisma,
    startDate,
    endDate,
    maxResults: Number.parseInt(
      process.env.ARXIV_MAX_RESULTS ?? process.env.ARXIV_PAGE_SIZE ?? "50",
      10,
    ),
    maxPages: Number.parseInt(process.env.ARXIV_MAX_PAGES ?? "20", 10),
  });

  if (summary.candidates === 0) {
    throw new Error("No arXiv candidates returned for the configured date range.");
  }
}

main()
  .catch((error) => {
    console.error("Ingestion failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
