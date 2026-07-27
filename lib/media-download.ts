import type { MediaType } from "./generated/prisma/client";
import { prisma } from "./prisma";
import { fetchStoredObject } from "./uploads";

function dispositionFilename(name: string) {
  return name.replace(/["\\\r\n]/g, "_");
}

export async function mediaDownloadResponse(
  request: Request,
  id: string,
  expectedType?: MediaType,
) {
  const url = new URL(request.url);
  const inline = url.searchParams.get("inline") === "1";
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });

  if (!asset || (expectedType && asset.mediaType !== expectedType)) {
    return Response.json(
      { error: "Media asset not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const storageResponse = await fetchStoredObject(asset.objectName);

  if (!storageResponse.ok || !storageResponse.body) {
    return Response.json(
      { error: "Unable to read media asset" },
      { status: storageResponse.status || 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(storageResponse.body, {
    status: 200,
    headers: {
      "Cache-Control": inline
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "no-store",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${dispositionFilename(
        asset.originalName,
      )}"`,
      "Content-Length": String(asset.size),
      "Content-Type": asset.contentType,
    },
  });
}
