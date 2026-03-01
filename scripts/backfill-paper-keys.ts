import prisma from "../lib/prisma";
import { normalizePaperKeyFromPaper } from "../lib/paper-keys";

async function main() {
  const papers = await prisma.paper.findMany({
    select: {
      id: true,
      doi: true,
      doiUrl: true,
      sourceUrl: true,
      arxivId: true,
      semanticScholarId: true,
      paperKey: true,
    },
  });

  let updated = 0;

  for (const paper of papers) {
    const normalizedKey = normalizePaperKeyFromPaper(paper);
    if (!normalizedKey || normalizedKey === paper.paperKey) {
      continue;
    }

    await prisma.paper.update({
      where: { id: paper.id },
      data: { paperKey: normalizedKey },
    });
    updated += 1;
  }

  console.log(`Backfilled paperKey for ${updated} papers.`);
}

main()
  .catch((error) => {
    console.error("paperKey backfill failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
