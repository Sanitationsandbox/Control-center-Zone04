import type {
  ControlKind,
  MediaAsset,
  MediaGroup,
  MediaGroupItem,
  MediaType,
} from "./generated/prisma/client";

export const MEDIA_GROUP_SLUGS = [
  "bhrt",
  "video",
  "what-lies-inside",
  "use-case",
] as const;

// Media groups ("fields") can now be created dynamically at runtime, so the
// slug is any string persisted in the database — MEDIA_GROUP_SLUGS above is
// only the set of built-in fields with custom copy in control-options.ts.
export type MediaGroupSlug = string;

export function getMediaType(contentType: string): MediaType {
  if (contentType.startsWith("image/")) return "IMAGE";
  if (contentType.startsWith("video/")) return "VIDEO";
  if (contentType === "application/pdf") return "PDF";
  return "OTHER";
}

export function mediaAssetResponse(asset: MediaAsset) {
  const downloadUrl = `/api/media/${asset.id}/download`;
  const inlineUrl = `/api/media/${asset.id}/download?inline=1`;

  return {
    id: asset.id,
    name: asset.originalName,
    filename: asset.objectName.split("/").pop() ?? asset.objectName,
    url: inlineUrl,
    type: asset.contentType,
    uploadedAt: asset.createdAt.getTime(),
    originalName: asset.originalName,
    contentType: asset.contentType,
    size: asset.size,
    mediaType: asset.mediaType,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    downloadUrl,
    inlineUrl,
  };
}

export function mediaAssetWithPipelinesResponse(
  asset: MediaAsset & {
    groupItems: (MediaGroupItem & { group: MediaGroup })[];
  },
) {
  return {
    ...mediaAssetResponse(asset),
    pipelines: asset.groupItems
      .filter((item) => item.enabled)
      .sort((a, b) => a.group.sortOrder - b.group.sortOrder)
      .map((item) => ({
        itemId: item.id,
        groupId: item.group.id,
        slug: item.group.slug,
        displayName: item.group.displayName,
        position: item.position,
        active: item.group.activeItemId === item.id,
      })),
  };
}

export function mediaGroupResponse(
  group: MediaGroup & {
    items: (MediaGroupItem & { asset: MediaAsset })[];
  },
) {
  return {
    id: group.id,
    slug: group.slug,
    displayName: group.displayName,
    controlKind: group.controlKind satisfies ControlKind,
    sortOrder: group.sortOrder,
    activeIndex: group.activeIndex,
    activeItemId: group.activeItemId,
    items: group.items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        enabled: item.enabled,
        asset: mediaAssetResponse(item.asset),
      })),
  };
}

export type MediaGroupResponse = ReturnType<typeof mediaGroupResponse>;
