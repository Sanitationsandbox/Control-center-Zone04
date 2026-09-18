import "server-only";

import pg from "pg";
import { broadcastControlState } from "@/lib/control-events";
import { loadControlState } from "@/lib/control-state";
import type { DisplayControlResponse } from "@/lib/display-control";

/** Must be a valid Postgres identifier — it is interpolated into LISTEN. */
const CONTROL_STATE_CHANNEL = "zone04_control_state";

const RECONNECT_BASE_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const globalForControlPubSub = globalThis as typeof globalThis & {
  controlNotifyPool?: pg.Pool;
  controlListenClient?: pg.Client;
  controlListenStarted?: boolean;
  controlListenAttempt?: number;
  controlLastBroadcastVersion?: number;
  controlPubSubWarned?: boolean;
};

const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL is not set. Control commands are broadcast only to WebSocket clients " +
  "attached to this process, so preview screens served by any other instance will " +
  "silently never update.";

/**
 * LISTEN needs a direct Postgres connection. A transaction-mode pooler accepts
 * the statement and then silently never delivers a notification — verified
 * against this project's own Neon database: the "-pooler" endpoint delivers
 * nothing, the same host without it delivers normally.
 *
 * DIRECT_DATABASE_URL wins if set. Otherwise a "-pooler" host is rewritten to its
 * direct counterpart, because shipping a silently one-instance fan-out is worse
 * than opening one extra connection.
 */
function resolveDirectDatabaseUrl(): string | null {
  const explicit = process.env.DIRECT_DATABASE_URL;
  if (explicit) return explicit;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (!globalForControlPubSub.controlPubSubWarned) {
      globalForControlPubSub.controlPubSubWarned = true;
      console.warn(MISSING_DATABASE_URL_MESSAGE);
    }
    return null;
  }

  if (!databaseUrl.includes("-pooler")) return databaseUrl;

  if (!globalForControlPubSub.controlPubSubWarned) {
    globalForControlPubSub.controlPubSubWarned = true;
    console.warn(
      "DATABASE_URL points at a connection pooler, which cannot hold a LISTEN. " +
        "Using the derived direct endpoint for control-state fan-out. Set " +
        "DIRECT_DATABASE_URL explicitly to override this.",
    );
  }

  return databaseUrl.replace("-pooler", "");
}

function getNotifyPool(): pg.Pool | null {
  const connectionString = resolveDirectDatabaseUrl();
  if (!connectionString) return null;

  globalForControlPubSub.controlNotifyPool ??= new pg.Pool({
    connectionString,
    max: 2,
  });
  return globalForControlPubSub.controlNotifyPool;
}

/**
 * Reloads the current state and pushes it to this instance's sockets. The NOTIFY
 * payload carries only a version number — pg_notify caps payloads at 8000 bytes
 * and a full snapshot is far larger — so the state itself comes from the database.
 */
async function fanOutFromNotification(rawVersion: string) {
  const version = Number(rawVersion);

  // Skip our own echo: the instance that published already broadcast locally, and
  // Postgres delivers the notification back to it as well.
  if (
    Number.isFinite(version) &&
    version <= (globalForControlPubSub.controlLastBroadcastVersion ?? 0)
  ) {
    return;
  }

  try {
    const state = await loadControlState();
    globalForControlPubSub.controlLastBroadcastVersion = state.version;
    broadcastControlState(state);
  } catch (error) {
    console.error("Failed to load control state after notification", error);
  }
}

function scheduleReconnect(failed: pg.Client) {
  // Only the client that is actually current may drive a reconnect, otherwise a
  // client that errored and then ended would start two loops.
  if (globalForControlPubSub.controlListenClient !== failed) return;

  globalForControlPubSub.controlListenClient = undefined;
  globalForControlPubSub.controlListenStarted = false;

  const attempt = globalForControlPubSub.controlListenAttempt ?? 0;
  globalForControlPubSub.controlListenAttempt = attempt + 1;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);

  void failed.end().catch(() => undefined);

  // Self-healing is the whole point: a dropped listener must come back on its own
  // rather than waiting for the next socket to connect, or every already-connected
  // wall freezes permanently while still reporting healthy.
  setTimeout(() => void ensureControlStateSubscription(), delay).unref?.();
}

async function startListener(connectionString: string) {
  const client = new pg.Client({ connectionString });
  globalForControlPubSub.controlListenClient = client;

  client.on("notification", (message) => {
    if (message.channel !== CONTROL_STATE_CHANNEL || !message.payload) return;
    void fanOutFromNotification(message.payload);
  });

  client.on("error", (error) => {
    console.error("Control state listener error", error);
    scheduleReconnect(client);
  });

  client.on("end", () => scheduleReconnect(client));

  await client.connect();
  await client.query(`LISTEN ${CONTROL_STATE_CHANNEL}`);
  globalForControlPubSub.controlListenAttempt = 0;
}

export async function publishControlState(state: DisplayControlResponse) {
  globalForControlPubSub.controlLastBroadcastVersion = state.version;
  broadcastControlState(state);

  const pool = getNotifyPool();
  if (!pool) return;

  try {
    await pool.query("SELECT pg_notify($1, $2)", [
      CONTROL_STATE_CHANNEL,
      String(state.version),
    ]);
  } catch (error) {
    console.error("Failed to publish control state", error);
  }
}

export async function ensureControlStateSubscription() {
  if (globalForControlPubSub.controlListenStarted) return;

  const connectionString = resolveDirectDatabaseUrl();
  if (!connectionString) return;

  globalForControlPubSub.controlListenStarted = true;

  try {
    await startListener(connectionString);
  } catch (error) {
    // LISTEN needs a direct Postgres connection; a transaction-mode pooler will
    // refuse it. Fan-out then degrades to this instance only, which is why this
    // is loud rather than silent.
    console.error(
      "Failed to start control state listener. Cross-instance updates are disabled: " +
        "preview screens served by another instance will not update. LISTEN/NOTIFY " +
        "requires a direct (non-pooled) DATABASE_URL.",
      error,
    );
    const client = globalForControlPubSub.controlListenClient;
    if (client) scheduleReconnect(client);
    else globalForControlPubSub.controlListenStarted = false;
  }
}
