import { NextResponse } from "next/server";
import { ContentType, ExtractablePotential } from "@prisma/client";

import {
  normalizeInteger,
  normalizeOptionalString,
} from "@/lib/curation";
import { getExcludedPaperKeySet } from "@/lib/excluded-papers";
import { basePaperInclude, serializePaper } from "@/lib/paper-serialization";
import { prisma } from "@/lib/prisma";

function normalizeEnumValue<T extends string>(value: unknown, allowed: T[]) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Expected one of: ${allowed.join(", ")}`);
  }

  return value as T;
}

function cleanLink(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Expected URL string.");
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ paperId: string }> },
) {
  try {
    const { paperId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const currentPaper = await prisma.paper.findUnique({
      where: { id: paperId },
      select: {
        id: true,
        title: true,
        linksProvenance: true,
      },
    });

    if (!currentPaper) {
      return NextResponse.json({ error: "Paper not found." }, { status: 404 });
    }

    const contentTypePrimary = normalizeEnumValue(
      body.contentTypePrimary,
      Object.values(ContentType),
    );
    const contentTypeSecondary = normalizeEnumValue(
      body.contentTypeSecondary,
      Object.values(ContentType),
    );
    const extractablePotential = normalizeEnumValue(
      body.extractablePotential,
      Object.values(ExtractablePotential),
    );
    const contentTypeOtherText = normalizeOptionalString(
      body.contentTypeOtherText as string | null | undefined,
    );

    if (contentTypePrimary == null && contentTypeSecondary != null) {
      throw new Error("Primary type is required when a secondary type is set.");
    }

    if (contentTypePrimary !== "OTHER" && contentTypeSecondary !== "OTHER" && contentTypeOtherText) {
      throw new Error("contentTypeOtherText is only allowed when one type is OTHER.");
    }

    const updatedPaper = await prisma.paper.update({
      where: { id: paperId },
      data: {
        worksheetCitationText: normalizeOptionalString(
          body.worksheetCitationText as string | null | undefined,
        ),
        worksheetSourceLink: normalizeOptionalString(
          body.worksheetSourceLink as string | null | undefined,
        ),
        contentTypePrimary,
        contentTypeSecondary,
        contentTypeOtherText:
          contentTypePrimary === "OTHER" || contentTypeSecondary === "OTHER"
            ? contentTypeOtherText
            : null,
        qualityScore: normalizeInteger(body.qualityScore as string | number | null | undefined, 1, 10),
        worksheetNote: normalizeOptionalString(body.worksheetNote as string | null | undefined),
        relevanceScore: normalizeInteger(
          body.relevanceScore as string | number | null | undefined,
          0,
          10,
        ),
        extractablePotential,
        studyLink: normalizeOptionalString(body.studyLink as string | null | undefined),
      },
      include: {
        ...basePaperInclude,
      },
    });

    const excludedKeys = await getExcludedPaperKeySet();
    return NextResponse.json(serializePaper(updatedPaper, excludedKeys));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown curation update error." },
      { status: 400 },
    );
  }
}
