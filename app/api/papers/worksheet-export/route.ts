import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { paperIds?: string[]; exported?: boolean };
    const paperIds = Array.isArray(body.paperIds)
      ? body.paperIds.filter((paperId): paperId is string => typeof paperId === "string" && paperId.trim().length > 0)
      : [];

    if (paperIds.length === 0) {
      return NextResponse.json({ error: "paperIds is required." }, { status: 400 });
    }

    const worksheetExportedAt = body.exported === false ? null : new Date();

    await prisma.paper.updateMany({
      where: {
        id: {
          in: paperIds,
        },
      },
      data: {
        worksheetExportedAt,
      },
    });

    return NextResponse.json({
      paperIds,
      worksheetExportedAt: worksheetExportedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown bulk worksheet export update error." },
      { status: 500 },
    );
  }
}
