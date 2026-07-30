import { mediaAssetResponse } from "@/lib/media";
import { broadcastUpdate } from "@/lib/broadcast";
import { prisma } from "@/lib/prisma";
import { deleteStoredObject, resourceTypeFromContentType } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(_request: Request, context: Params) {
  const { id } = await context.params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });

  if (!asset) return json({ error: "Media asset not found" }, 404);

  return json(mediaAssetResponse(asset));
}

export async function DELETE(_request: Request, context: Params) {
  const { id } = await context.params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });

  if (!asset) return json({ error: "Media asset not found" }, 404);

  await deleteStoredObject(asset.objectName, resourceTypeFromContentType(asset.contentType));
  await prisma.mediaAsset.delete({ where: { id } });
  broadcastUpdate("content-updated", { mediaId: id, deleted: true });

  return json({ success: true });
}
