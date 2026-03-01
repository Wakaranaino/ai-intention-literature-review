import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    const { paperId } = await context.params;
    const body = (await request.json()) as { watchlisted?: boolean };

    const updatedPaper = await prisma.paper.update({
      where: { id: paperId },
      data: { watchlisted: Boolean(body.watchlisted) },
      select: { id: true, watchlisted: true },
    });

    return NextResponse.json(updatedPaper);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown update error." },
      { status: 500 },
    );
  }
}
