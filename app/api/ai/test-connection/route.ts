import { NextResponse } from "next/server";

import { isHostedMode } from "@/lib/app-mode";
import { testLocalModelConnection } from "@/lib/local-ai";

export async function POST(request: Request) {
  try {
    if (isHostedMode()) {
      return NextResponse.json(
        { error: "AI generation is disabled on the hosted version." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { baseUrl?: string; model?: string | null };
    const result = await testLocalModelConnection({
      baseUrl: body.baseUrl ?? "",
      model: body.model ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local model test failed." },
      { status: 400 },
    );
  }
}
