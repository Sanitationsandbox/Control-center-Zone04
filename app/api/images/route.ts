import { NextRequest } from "next/server";
import { createMediaFromFormData, jsonNoStore } from "@/lib/media-api";
import { mediaAssetWithPipelinesResponse } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const assets = await prisma.mediaAsset.findMany({
    where: { mediaType: "IMAGE" },
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
  const formData = await request.formData();
  const groupSlug = formData.get("groupSlug");
  return createMediaFromFormData(formData, {
    folder: "images",
    expectedType: "IMAGE",
    groupSlug: typeof groupSlug === "string" ? groupSlug : null,
  });
}
