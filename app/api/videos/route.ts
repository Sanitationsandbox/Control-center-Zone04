import { NextRequest } from "next/server";
import { createMediaFromMetadata, jsonNoStore } from "@/lib/media-api";
import { mediaAssetWithPipelinesResponse } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const assets = await prisma.mediaAsset.findMany({
    where: { mediaType: "VIDEO" },
    include: {
      groupItems: {
        include: { group: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(assets.map(mediaAssetWithPipelinesResponse), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return jsonNoStore(
      {
        error:
          "Server-side video uploads are disabled. Upload directly to Cloudinary, then register asset metadata as JSON.",
      },
      415,
    );
  }

  const body = await request.json().catch(() => ({}));
  return createMediaFromMetadata(body, { expectedType: "VIDEO" });
}
