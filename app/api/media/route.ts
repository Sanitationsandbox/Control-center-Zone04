import { NextRequest } from "next/server";
import { createMediaFromFormData, createMediaFromMetadata, jsonNoStore } from "@/lib/media-api";
import { mediaAssetWithPipelinesResponse } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mediaType = request.nextUrl.searchParams.get("type");
  const assets = await prisma.mediaAsset.findMany({
    where:
      mediaType === "IMAGE" ||
      mediaType === "VIDEO" ||
      mediaType === "PDF" ||
      mediaType === "OTHER"
        ? { mediaType }
        : undefined,
    include: {
      groupItems: {
        include: { group: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return jsonNoStore(assets.map(mediaAssetWithPipelinesResponse));
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return createMediaFromMetadata(body);
  }

  const formData = await request.formData();
  const groupSlug = formData.get("groupSlug");
  return createMediaFromFormData(formData, {
    folder: "media",
    groupSlug: typeof groupSlug === "string" ? groupSlug : null,
  });
}

