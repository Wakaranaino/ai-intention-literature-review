import { NextResponse } from "next/server";

import { isHostedMode } from "@/lib/app-mode";
import { generateLocalCurationDraft } from "@/lib/local-ai";

export async function POST(request: Request) {
  try {
    if (isHostedMode()) {
      return NextResponse.json(
        { error: "AI generation is disabled on the hosted version." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      paperId?: string;
      title?: string;
      abstract?: string;
      authors?: string;
      year?: number;
      venue?: string | null;
      tags?: string[];
      sourceUrl?: string;
      pdfUrl?: string;
      doiUrl?: string | null;
      arxivId?: string | null;
      localModel?: {
        baseUrl?: string;
        model?: string | null;
      };
    };

    const result = await generateLocalCurationDraft(
      {
        baseUrl: body.localModel?.baseUrl ?? "",
        model: body.localModel?.model ?? null,
      },
      {
        paperId: body.paperId,
        title: body.title ?? "",
        abstract: body.abstract ?? "",
        authors: body.authors ?? "",
        year: body.year ?? 0,
        venue: body.venue ?? null,
        tags: body.tags ?? [],
        sourceUrl: body.sourceUrl ?? "",
        pdfUrl: body.pdfUrl ?? "",
        doiUrl: body.doiUrl ?? null,
        arxivId: body.arxivId ?? null,
      },
    );

    return NextResponse.json(result.draft);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI generation failed." },
      { status: 400 },
    );
  }
}
