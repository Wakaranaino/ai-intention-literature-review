import prisma from "../lib/prisma";
import { loadTagRules, getMatchedTagNames } from "../lib/tagging";

async function main() {
  const tagRules = await loadTagRules();
  const papers = await prisma.paper.findMany({
    select: {
      id: true,
      title: true,
      abstract: true,
    },
    orderBy: { publishedAt: "desc" },
  });

  let changedPapers = 0;

  for (const paper of papers) {
    const tagNames = getMatchedTagNames(
      { title: paper.title, abstract: paper.abstract },
      tagRules,
    );

    const currentTagRows = await prisma.paperTag.findMany({
      where: { paperId: paper.id },
      select: { tag: { select: { id: true, name: true } } },
    });

    const currentTagNames = currentTagRows
      .map((paperTag) => paperTag.tag.name)
      .sort((left, right) => left.localeCompare(right));

    const unchanged =
      currentTagNames.length === tagNames.length &&
      currentTagNames.every((tagName, index) => tagName === tagNames[index]);

    if (unchanged) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const tagIds: string[] = [];
      for (const tagName of tagNames) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        tagIds.push(tag.id);
      }

      await tx.paperTag.deleteMany({ where: { paperId: paper.id } });

      if (tagIds.length > 0) {
        await tx.paperTag.createMany({
          data: tagIds.map((tagId) => ({ paperId: paper.id, tagId })),
        });
      }
    });

    changedPapers += 1;
  }

  const orphanTags = await prisma.tag.findMany({
    where: { paperTags: { none: {} } },
    select: { id: true },
  });

  if (orphanTags.length > 0) {
    await prisma.tag.deleteMany({
      where: { id: { in: orphanTags.map((tag) => tag.id) } },
    });
  }

  console.log(
    `Retag complete: ${changedPapers} papers updated, ${orphanTags.length} orphan tags removed, ${papers.length} papers scanned.`,
  );
}

main()
  .catch((error) => {
    console.error("Retag failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
