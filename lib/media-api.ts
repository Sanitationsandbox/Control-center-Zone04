import type { MediaType } from "./generated/prisma/client";
import { advanceControlState } from "./control-state";
import { publishControlState } from "./control-pubsub";
import { getMediaType, mediaAssetResponse } from "./media";
import { prisma } from "./prisma";

type CreateMediaOptions = {
  expectedType?: MediaType;
  groupSlug?: string | null;
};

export function jsonNoStore(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function createMediaFromMetadata(body: {
  originalName: string;
  objectName: string;
  contentType: string;
  size: number;
  groupSlug?: string | null;
}, { expectedType, groupSlug: defaultGroupSlug }: CreateMediaOptions = {}) {
  const { originalName, objectName, contentType, size, groupSlug } = body;
  const effectiveGroupSlug = groupSlug ?? defaultGroupSlug;

  if (!originalName || !objectName || !contentType || typeof size !== "number") {
    return jsonNoStore({ error: "Missing required metadata fields" }, 400);
  }

  const mediaType = getMediaType(contentType);
  if (expectedType && mediaType !== expectedType) {
    return jsonNoStore(
      { error: `File ${originalName} is not a valid ${expectedType.toLowerCase()} asset` },
      400,
    );
  }

  if (effectiveGroupSlug) {
    const group = await prisma.mediaGroup.findUnique({ where: { slug: effectiveGroupSlug } });
    if (!group) return jsonNoStore({ error: "Media group not found" }, 404);
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      originalName,
      objectName,
      contentType,
      size,
      mediaType,
    },
  });

  if (effectiveGroupSlug) {
    const lastItem = await prisma.mediaGroupItem.findFirst({
      where: { group: { slug: effectiveGroupSlug } },
      orderBy: { position: "desc" },
    });

    const item = await prisma.mediaGroupItem.create({
      data: {
        group: { connect: { slug: effectiveGroupSlug } },
        asset: { connect: { id: asset.id } },
        position: (lastItem?.position ?? -1) + 1,
      },
    });

    await prisma.mediaGroup.update({
      where: { slug: effectiveGroupSlug },
      data: {
        activeIndex: item.position,
        activeItemId: item.id,
      },
    });
  }

  await publishControlState(await advanceControlState());

  return jsonNoStore(
    {
      success: true,
      asset: mediaAssetResponse(asset),
    },
    201,
  );
}
