import { PaperKind } from "@prisma/client";

import prisma from "../lib/prisma";

function buildAbsUrl(arxivId: string) {
  return `https://arxiv.org/abs/${arxivId}`;
}

function buildPdfUrl(arxivId: string) {
  return `https://arxiv.org/pdf/${arxivId}.pdf`;
}

async function main() {
  const papers = await prisma.paper.findMany({
    where: {
      arxivId: {
        not: null,
      },
    },
    select: {
      id: true,
      arxivId: true,
      sourceUrl: true,
      pdfUrl: true,
      paperKind: true,
      doiUrl: true,
      venue: true,
    },
  });

  let updated = 0;

  for (const paper of papers) {
    if (!paper.arxivId) {
      continue;
    }

    const sourceUrl = buildAbsUrl(paper.arxivId);
    const pdfUrl = buildPdfUrl(paper.arxivId);
    const needsUpdate =
      paper.sourceUrl !== sourceUrl ||
      paper.pdfUrl !== pdfUrl ||
      paper.paperKind !== PaperKind.PREPRINT ||
      paper.doiUrl !== null ||
      paper.venue !== null;

    if (!needsUpdate) {
      continue;
    }

    await prisma.paper.update({
      where: { id: paper.id },
      data: {
        sourceUrl,
        pdfUrl,
        paperKind: PaperKind.PREPRINT,
        doiUrl: null,
        venue: null,
      },
    });
    updated += 1;
  }

  console.log(`Normalized ${updated} arXiv papers to canonical arXiv/preprint fields.`);
}

main()
  .catch((error) => {
    console.error("arXiv canonical normalization failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
