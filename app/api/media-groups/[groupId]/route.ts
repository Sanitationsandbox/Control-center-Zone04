import { broadcastUpdate } from "@/lib/broadcast";
import { mediaGroupResponse } from "@/lib/media";
import { ActiveSelectionError, applyActiveSelection } from "@/lib/media-groups";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{ groupId: string }>;
};

type UpdateBody = {
  itemIds?: unknown;
  enabledItemIds?: unknown;
  activeIndex?: unknown;
  activeItemId?: unknown;
  addAssetId?: unknown;
  removeAssetId?: unknown;
  visible?: unknown;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function GET(_request: Request, context: Params) {
  const { groupId } = await context.params;
  const group = await prisma.mediaGroup.findFirst({
    where: { OR: [{ id: groupId }, { slug: groupId }] },
    include: {
      items: {
        include: { asset: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!group) return json({ error: "Media group not found" }, 404);

  return json(mediaGroupResponse(group));
}

export async function PATCH(request: Request, context: Params) {
  const { groupId } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;

  if (!body) return json({ error: "Invalid media group payload" }, 400);

  const group = await prisma.mediaGroup.findFirst({
    where: { OR: [{ id: groupId }, { slug: groupId }] },
  });

  if (!group) return json({ error: "Media group not found" }, 404);

  if (body.visible !== undefined) {
    if (typeof body.visible !== "boolean") {
      return json({ error: "visible must be a boolean" }, 400);
    }

    await prisma.mediaGroup.update({
      where: { id: group.id },
      data: { visible: body.visible },
    });
  }

  if (body.itemIds !== undefined) {
    if (!isStringArray(body.itemIds)) {
      return json({ error: "itemIds must be an array of strings" }, 400);
    }

    await prisma.$transaction(
      body.itemIds.map((itemId, position) =>
        prisma.mediaGroupItem.updateMany({
          where: { id: itemId, groupId: group.id },
          data: { position },
        }),
      ),
    );
  }

  if (body.addAssetId !== undefined) {
    if (typeof body.addAssetId !== "string") {
      return json({ error: "addAssetId must be a string" }, 400);
    }

    const existingAsset = await prisma.mediaAsset.findUnique({
      where: { id: body.addAssetId },
    });

    if (!existingAsset) return json({ error: "Media asset not found" }, 404);

    const existingItem = await prisma.mediaGroupItem.findFirst({
      where: { groupId: group.id, assetId: body.addAssetId },
    });

    const item = existingItem
      ? await prisma.mediaGroupItem.update({
          where: { id: existingItem.id },
          data: { enabled: true },
        })
      : await prisma.mediaGroupItem.create({
          data: {
            groupId: group.id,
            assetId: body.addAssetId,
            position:
              ((await prisma.mediaGroupItem.findFirst({
                where: { groupId: group.id },
                orderBy: { position: "desc" },
              }))?.position ?? -1) + 1,
          },
        });

    await prisma.mediaGroup.update({
      where: { id: group.id },
      data: {
        activeIndex: item.position,
        activeItemId: item.id,
      },
    });
  }

  if (body.removeAssetId !== undefined) {
    if (typeof body.removeAssetId !== "string") {
      return json({ error: "removeAssetId must be a string" }, 400);
    }

    const removed = await prisma.mediaGroupItem.deleteMany({
      where: { groupId: group.id, assetId: body.removeAssetId },
    });

    if (removed.count > 0) {
      const remainingItems = await prisma.mediaGroupItem.findMany({
        where: { groupId: group.id },
        orderBy: { position: "asc" },
      });

      await prisma.$transaction(
        remainingItems.map((item, position) =>
          prisma.mediaGroupItem.update({
            where: { id: item.id },
            data: { position },
          }),
        ),
      );

      await prisma.mediaGroup.update({
        where: { id: group.id },
        data: {
          activeIndex: remainingItems.length > 0 ? 0 : -1,
          activeItemId: remainingItems[0]?.id ?? null,
        },
      });
    }
  }

  if (body.enabledItemIds !== undefined) {
    if (!isStringArray(body.enabledItemIds)) {
      return json({ error: "enabledItemIds must be an array of strings" }, 400);
    }

    await prisma.mediaGroupItem.updateMany({
      where: { groupId: group.id },
      data: { enabled: false },
    });

    if (body.enabledItemIds.length > 0) {
      await prisma.mediaGroupItem.updateMany({
        where: { groupId: group.id, id: { in: body.enabledItemIds } },
        data: { enabled: true },
      });
    }
  }

  if (body.activeIndex !== undefined || body.activeItemId !== undefined) {
    const activeIndex =
      typeof body.activeIndex === "number" &&
      Number.isInteger(body.activeIndex) &&
      body.activeIndex >= -1
        ? body.activeIndex
        : undefined;

    if (body.activeIndex !== undefined && activeIndex === undefined) {
      return json({ error: "activeIndex must be an integer greater than or equal to -1" }, 400);
    }

    if (
      body.activeItemId !== undefined &&
      body.activeItemId !== null &&
      typeof body.activeItemId !== "string"
    ) {
      return json({ error: "activeItemId must be a string or null" }, 400);
    }

    const nextActiveItemId =
      body.activeItemId === undefined
        ? undefined
        : body.activeItemId === null
          ? null
          : body.activeItemId;

    try {
      await applyActiveSelection(group, { activeIndex, activeItemId: nextActiveItemId });
    } catch (error) {
      if (error instanceof ActiveSelectionError) {
        return json({ error: error.message }, 400);
      }
      throw error;
    }
  }

  const updatedGroup = await prisma.mediaGroup.findUniqueOrThrow({
    where: { id: group.id },
    include: {
      items: {
        include: { asset: true },
        orderBy: { position: "asc" },
      },
    },
  });

  broadcastUpdate("content-updated", {
    groupId: updatedGroup.slug,
    activeIndex: updatedGroup.activeIndex,
    activeItemId: updatedGroup.activeItemId,
  });

  return json(mediaGroupResponse(updatedGroup));
}
