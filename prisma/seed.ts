import { PrismaClient } from "@prisma/client";

import { demoPapers } from "../data/demo-papers";
import { upsertPaperRecords } from "../lib/ingest-core";
import { loadIngestKeywords, matchesAnyKeyword } from "../lib/ingest-keywords";
import { loadTagRules } from "../lib/tagging";

const prisma = new PrismaClient();

async function main() {
  const ingestKeywords = await loadIngestKeywords();
  const tagRules = await loadTagRules();
  const gatedDemoPapers = demoPapers.filter((paper) =>
    matchesAnyKeyword({ title: paper.title, abstract: paper.abstract }, ingestKeywords),
  );
  const result = await upsertPaperRecords(prisma, gatedDemoPapers, tagRules);
  console.log(`Seeded demo data: ${result.created} created, ${result.updated} updated.`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
