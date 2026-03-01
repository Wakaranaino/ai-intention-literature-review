import { NextResponse } from "next/server";

import { importExcludedPaperLinks } from "@/lib/excluded-papers";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: string };
    const input = typeof body.input === "string" ? body.input : "";

    const summary = await importExcludedPaperLinks(input);
    return NextResponse.json({
      imported: summary.imported,
      duplicatesSkipped: summary.duplicatesSkipped,
      invalidCount: summary.invalidLines.length,
      invalidLines: summary.invalidLines.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown excluded-paper import error.",
      },
      { status: 500 },
    );
  }
}
