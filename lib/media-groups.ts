import { prisma } from "./prisma";
import type { MediaGroup, Prisma } from "./generated/prisma/client";

export class ActiveSelectionError extends Error {}

type Db = Prisma.TransactionClient | typeof prisma;

export async function applyActiveSelection(
  group: MediaGroup,
  input: { activeIndex?: number; activeItemId?: string | null },
  db: Db = prisma,
) {
  let nextActiveIndex = input.activeIndex;
  let nextActiveItemId = input.activeItemId;

  if (typeof nextActiveItemId === "string") {
    const activeItem = await db.mediaGroupItem.findFirst({
      where: { id: nextActiveItemId, groupId: group.id },
    });

    if (!activeItem) {
      throw new ActiveSelectionError("activeItemId must belong to this media group");
    }

    nextActiveIndex ??= activeItem.position;
  }

  if (nextActiveIndex === -1) {
    nextActiveItemId = null;
  }

  return db.mediaGroup.update({
    where: { id: group.id },
    data: {
      ...(nextActiveIndex !== undefined ? { activeIndex: nextActiveIndex } : {}),
      ...(nextActiveItemId !== undefined ? { activeItemId: nextActiveItemId } : {}),
    },
  });
}
