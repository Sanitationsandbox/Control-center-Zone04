import { NextRequest } from "next/server";
import { createMediaFromFormData } from "@/lib/media-api";
import { mediaAssetWithPipelinesResponse } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const assets = await prisma.mediaAsset.findMany({
    where: { mediaType: "PDF" },
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
  const formData = await request.formData();
  const groupSlug = formData.get("groupSlug");
  return createMediaFromFormData(formData, {
    folder: "pdfs",
    expectedType: "PDF",
    groupSlug: typeof groupSlug === "string" ? groupSlug : null,
  });
}
