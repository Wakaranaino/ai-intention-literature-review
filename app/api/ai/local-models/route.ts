import { NextResponse } from "next/server";

import { isHostedMode } from "@/lib/app-mode";
import { fetchLocalModels } from "@/lib/local-ai";

export async function POST(request: Request) {
  try {
    if (isHostedMode()) {
      return NextResponse.json(
        { error: "AI generation is disabled on the hosted version." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { baseUrl?: string };
    const models = await fetchLocalModels({
      baseUrl: body.baseUrl ?? "",
    });

    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch local models." },
      { status: 400 },
    );
  }
}
