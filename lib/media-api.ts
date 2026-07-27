import type { MediaType } from "./generated/prisma/client";
import { broadcastUpdate } from "./broadcast";
import { getMediaType, mediaAssetResponse } from "./media";
import { prisma } from "./prisma";
import { uploadStoredObject } from "./uploads";

type CreateMediaOptions = {
  folder: string;
  expectedType?: MediaType;
  groupSlug?: string | null;
};

export function jsonNoStore(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function createMediaFromFormData(
  formData: FormData,
  { folder, expectedType, groupSlug }: CreateMediaOptions,
) {
  const files = formData.getAll("files").filter((file): file is File => file instanceof File);

  if (files.length === 0) {
    return jsonNoStore({ error: "No files provided" }, 400);
  }

  if (groupSlug) {
    const group = await prisma.mediaGroup.findUnique({ where: { slug: groupSlug } });
    if (!group) return jsonNoStore({ error: "Media group not found" }, 404);
  }

  if (expectedType) {
    const requiredType = expectedType;
    const invalidFile = files.find(
      (file) => getMediaType(file.type || "application/octet-stream") !== requiredType,
    );

    if (invalidFile) {
      return jsonNoStore(
        { error: `File ${invalidFile.name} is not a valid ${requiredType.toLowerCase()} asset` },
        400,
      );
    }
  }

  const createdAssets = [];

  for (const file of files) {
    const stored = await uploadStoredObject(file, folder);
    const mediaType = expectedType ?? getMediaType(stored.contentType);
    const asset = await prisma.mediaAsset.create({
      data: {
        originalName: file.name,
        objectName: stored.objectName,
        contentType: stored.contentType,
        size: stored.size,
        mediaType,
      },
    });

    if (groupSlug) {
      const lastItem = await prisma.mediaGroupItem.findFirst({
        where: { group: { slug: groupSlug } },
        orderBy: { position: "desc" },
      });

      const item = await prisma.mediaGroupItem.create({
        data: {
          group: { connect: { slug: groupSlug } },
          asset: { connect: { id: asset.id } },
          position: (lastItem?.position ?? -1) + 1,
        },
      });

      await prisma.mediaGroup.update({
        where: { slug: groupSlug },
        data: {
          activeIndex: item.position,
          activeItemId: item.id,
        },
      });

      broadcastUpdate("content-updated", {
        groupId: groupSlug,
        mediaId: asset.id,
        itemId: item.id,
      });
    }

    createdAssets.push(asset);
  }

  if (!groupSlug) {
    broadcastUpdate("content-updated", {
      mediaIds: createdAssets.map((asset) => asset.id),
      uploaded: true,
    });
  }

  return jsonNoStore(
    {
      success: true,
      assets: createdAssets.map(mediaAssetResponse),
    },
    201,
  );
}
