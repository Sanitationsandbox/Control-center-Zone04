import "server-only";

import type { Prisma } from "./generated/prisma/client";
import type {
  DisplayControlResponse,
  NavigateDirection,
  PlaybackCommand,
} from "./display-control";
import { mediaGroupResponse } from "./media";
import { ActiveSelectionError, applyActiveSelection } from "./media-groups";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient;

export type ControlCommand =
  | { action: "clear" }
  | { action: "activate"; groupId: string }
  | { action: "navigate"; direction: NavigateDirection }
  | { action: "playback"; playback: PlaybackCommand };

type RawControlCommand = {
  action?: unknown;
  groupId?: unknown;
  direction?: unknown;
  playback?: unknown;
};

/** Carries the HTTP status the route should answer with. */
export class ControlCommandError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isDirection(value: unknown): value is NavigateDirection {
  return value === "previous" || value === "next";
}

function isPlayback(value: unknown): value is PlaybackCommand {
  return value === "play" || value === "pause";
}

export function parseControlCommand(body: RawControlCommand | null): ControlCommand | null {
  if (!body || typeof body.action !== "string") return null;

  if (body.action === "clear") {
    return { action: "clear" };
  }

  if (body.action === "activate" && typeof body.groupId === "string") {
    return { action: "activate", groupId: body.groupId };
  }

  if (body.action === "navigate" && isDirection(body.direction)) {
    return { action: "navigate", direction: body.direction };
  }

  if (body.action === "playback" && isPlayback(body.playback)) {
    return { action: "playback", playback: body.playback };
  }

  return null;
}

/**
 * Reads the monotonic state version without advancing it. A freshly created
 * sequence reports last_value = START with is_called = false, so the very first
 * nextval() returns that same value — normalise the not-yet-called case to zero
 * so "no command has run yet" is distinguishable from "one command has run".
 */
async function readVersion(db: Db): Promise<number> {
  const [row] = await db.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`
    SELECT last_value, is_called FROM "control_state_version"
  `;
  return Number(row.last_value) - (row.is_called ? 0 : 1);
}

async function advanceVersion(db: Db): Promise<number> {
  const [row] = await db.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('control_state_version')
  `;
  return Number(row.nextval);
}

/**
 * Read path only — deliberately does not upsert. The row is created by the first
 * command that actually changes something; a wall connecting should never write.
 */
async function readControlState(db: Db, version: number): Promise<DisplayControlResponse> {
  const [state, groups] = await Promise.all([
    db.displayControlState.findUnique({ where: { id: "default" } }),
    db.mediaGroup.findMany({
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
    version,
    activeGroupId: state?.activeGroupId ?? null,
    videoPlaying: state?.videoPlaying ?? false,
    updatedAt: state?.updatedAt.getTime() ?? 0,
    groups: groups.map(mediaGroupResponse),
  };
}

async function ensureState(db: Db) {
  return db.displayControlState.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function loadControlState(): Promise<DisplayControlResponse> {
  return prisma.$transaction(async (tx) => readControlState(tx, await readVersion(tx)));
}

/**
 * Bumps the version and snapshots the result, for mutations that happen outside
 * applyControlCommand — uploads, deletes and group edits. Without the bump the
 * snapshot would ship with a version clients have already seen, and every wall
 * would discard it.
 */
export async function advanceControlState(): Promise<DisplayControlResponse> {
  return prisma.$transaction(async (tx) => readControlState(tx, await advanceVersion(tx)));
}

export type CommandResult = {
  state: DisplayControlResponse;
  /**
   * False when the command was a no-op. The caller must not publish in that case:
   * skipping the write and the version bump is pointless if every wall is woken
   * anyway, which is what end-of-deck button mashing does.
   */
  changed: boolean;
};

/**
 * Writes the command, advances the version and snapshots the result inside a
 * single transaction, so the returned version always describes exactly the state
 * that ships with it.
 */
export async function applyControlCommand(
  command: ControlCommand,
): Promise<CommandResult> {
  return prisma.$transaction(async (tx) => {
    if (command.action === "clear") {
      await tx.displayControlState.upsert({
        where: { id: "default" },
        update: { activeGroupId: null, videoPlaying: false },
        create: { id: "default" },
      });

      return { state: await readControlState(tx, await advanceVersion(tx)), changed: true };
    }

    if (command.action === "activate") {
      const group = await tx.mediaGroup.findFirst({
        where: { OR: [{ id: command.groupId }, { slug: command.groupId }] },
      });

      if (!group) throw new ControlCommandError("Media group not found", 404);

      const videoPlaying = group.controlKind === "VIDEO";

      await tx.displayControlState.upsert({
        where: { id: "default" },
        update: { activeGroupId: group.id, videoPlaying },
        create: { id: "default", activeGroupId: group.id, videoPlaying },
      });

      return { state: await readControlState(tx, await advanceVersion(tx)), changed: true };
    }

    const state = await ensureState(tx);
    if (!state.activeGroupId) {
      throw new ControlCommandError("No active media group", 400);
    }

    if (command.action === "playback") {
      const activeGroup = await tx.mediaGroup.findUnique({
        where: { id: state.activeGroupId },
      });

      if (!activeGroup || activeGroup.controlKind !== "VIDEO") {
        throw new ControlCommandError(
          "Active media group does not support playback control",
          400,
        );
      }

      const videoPlaying = command.playback === "play";

      // Already in this playback state — don't write, don't bump the version,
      // don't wake every wall up for nothing.
      if (state.videoPlaying === videoPlaying) {
        return { state: await readControlState(tx, await readVersion(tx)), changed: false };
      }

      await tx.displayControlState.update({
        where: { id: "default" },
        data: { videoPlaying },
      });

      return { state: await readControlState(tx, await advanceVersion(tx)), changed: true };
    }

    const activeGroup = await tx.mediaGroup.findUnique({
      where: { id: state.activeGroupId },
      include: {
        items: {
          where: { enabled: true },
          include: { asset: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!activeGroup) throw new ControlCommandError("Active media group not found", 404);

    const items = activeGroup.items;
    if (items.length === 0) {
      throw new ControlCommandError("Active media group has no enabled items", 400);
    }

    const currentIndex = items.findIndex((item) => item.id === activeGroup.activeItemId);
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
    const delta = command.direction === "next" ? 1 : -1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, safeCurrentIndex + delta));
    const nextItem = items[nextIndex];

    // Clamped to this item already — same reasoning as playback above.
    if (nextItem.id === activeGroup.activeItemId) {
      return { state: await readControlState(tx, await readVersion(tx)), changed: false };
    }

    try {
      await applyActiveSelection(activeGroup, { activeItemId: nextItem.id }, tx);
    } catch (error) {
      if (error instanceof ActiveSelectionError) {
        throw new ControlCommandError(error.message, 400);
      }
      throw error;
    }

    return { state: await readControlState(tx, await advanceVersion(tx)), changed: true };
  });
}
