import { NextResponse } from "next/server";

import { getExcludedPaperKeySet } from "@/lib/excluded-papers";
import { basePaperInclude, serializePaper } from "@/lib/paper-serialization";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    const { paperId } = await context.params;
    const body = (await request.json()) as { exported?: boolean };
    const worksheetExportedAt = body.exported === false ? null : new Date();

    const updatedPaper = await prisma.paper.update({
      where: { id: paperId },
      data: { worksheetExportedAt },
      include: {
        ...basePaperInclude,
      },
    });

    const excludedKeys = await getExcludedPaperKeySet();
    return NextResponse.json(serializePaper(updatedPaper, excludedKeys));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown worksheet export update error." },
      { status: 500 },
    );
  }
}
