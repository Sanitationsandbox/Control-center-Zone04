import { broadcastUpdate } from "@/lib/broadcast";
import type { DisplayControlResponse } from "@/lib/display-control";
import { mediaGroupResponse } from "@/lib/media";
import { ActiveSelectionError, applyActiveSelection } from "@/lib/media-groups";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isDirection(value: unknown): value is "previous" | "next" {
  return value === "previous" || value === "next";
}

function isPlayback(value: unknown): value is "play" | "pause" {
  return value === "play" || value === "pause";
}

async function ensureState() {
  return prisma.displayControlState.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

async function buildResponse(): Promise<DisplayControlResponse> {
  const [state, groups] = await Promise.all([
    ensureState(),
    prisma.mediaGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          include: { asset: true },
          orderBy: { position: "asc" },
        },
      },
    }),
  ]);

  return {
    activeGroupId: state.activeGroupId,
    videoPlaying: state.videoPlaying,
    updatedAt: state.updatedAt.getTime(),
    groups: groups.map(mediaGroupResponse),
  };
}

export async function GET() {
  return json(await buildResponse());
}

type Body = {
  action?: unknown;
  groupId?: unknown;
  direction?: unknown;
  playback?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;

  if (!body || typeof body.action !== "string") {
    return json({ error: "Invalid display control command" }, 400);
  }

  if (body.action === "activate") {
    if (typeof body.groupId !== "string") {
      return json({ error: "groupId must be a string" }, 400);
    }

    const group = await prisma.mediaGroup.findFirst({
      where: { OR: [{ id: body.groupId }, { slug: body.groupId }] },
    });

    if (!group) return json({ error: "Media group not found" }, 404);

    await prisma.displayControlState.upsert({
      where: { id: "default" },
      update: { activeGroupId: group.id, videoPlaying: group.controlKind === "VIDEO" },
      create: {
        id: "default",
        activeGroupId: group.id,
        videoPlaying: group.controlKind === "VIDEO",
      },
    });

    broadcastUpdate("content-updated", { activeGroupId: group.id });
    return json(await buildResponse());
  }

  if (body.action === "clear") {
    await prisma.displayControlState.upsert({
      where: { id: "default" },
      update: { activeGroupId: null, videoPlaying: false },
      create: { id: "default" },
    });

    broadcastUpdate("content-updated", { activeGroupId: null });
    return json(await buildResponse());
  }

  if (body.action === "playback") {
    if (!isPlayback(body.playback)) {
      return json({ error: "playback must be 'play' or 'pause'" }, 400);
    }

    const state = await ensureState();
    if (!state.activeGroupId) {
      return json({ error: "No active media group" }, 400);
    }

    const activeGroup = await prisma.mediaGroup.findUnique({ where: { id: state.activeGroupId } });
    if (!activeGroup || activeGroup.controlKind !== "VIDEO") {
      return json({ error: "Active media group does not support playback control" }, 400);
    }

    await prisma.displayControlState.update({
      where: { id: "default" },
      data: { videoPlaying: body.playback === "play" },
    });

    broadcastUpdate("content-updated", { videoPlaying: body.playback === "play" });
    return json(await buildResponse());
  }

  if (body.action === "navigate") {
    if (!isDirection(body.direction)) {
      return json({ error: "direction must be 'previous' or 'next'" }, 400);
    }

    const state = await ensureState();
    if (!state.activeGroupId) {
      return json({ error: "No active media group" }, 400);
    }

    const activeGroup = await prisma.mediaGroup.findUnique({
      where: { id: state.activeGroupId },
      include: {
        items: {
          where: { enabled: true },
          include: { asset: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!activeGroup) return json({ error: "Active media group not found" }, 404);

    const items = activeGroup.items;
    if (items.length === 0) {
      return json({ error: "Active media group has no enabled items" }, 400);
    }

    const currentIndex = items.findIndex((item) => item.id === activeGroup.activeItemId);
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    const delta = body.direction === "next" ? 1 : -1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, safeCurrentIndex + delta));
    const nextItem = items[nextIndex];

    try {
      await applyActiveSelection(activeGroup, { activeItemId: nextItem.id });
    } catch (error) {
      if (error instanceof ActiveSelectionError) {
        return json({ error: error.message }, 400);
      }
      throw error;
    }

    broadcastUpdate("content-updated", { groupId: activeGroup.slug, activeItemId: nextItem.id });
    return json(await buildResponse());
  }

  return json({ error: "Invalid display control command" }, 400);
}
