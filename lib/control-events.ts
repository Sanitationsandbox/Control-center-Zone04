import "server-only";

import type { RawData, WebSocket } from "ws";
import type { DisplayControlResponse } from "@/lib/display-control";

export const CONTROL_STATE_CHANNEL = "zone04-control-state";

export type ControlClientMessage = { type: "SYNC" } | { type: "PING"; id: number };

export type ControlServerMessage =
  | { type: "INITIAL_STATE"; state: DisplayControlResponse }
  | { type: "STATE_SYNC"; state: DisplayControlResponse }
  | { type: "CONTROL_STATE_CHANGED"; state: DisplayControlResponse }
  | { type: "PONG"; id: number }
  | { type: "ERROR"; message: string };

type ClientSet = Set<WebSocket>;

const globalForControlEvents = globalThis as typeof globalThis & {
  controlClients?: ClientSet;
};

const clients = globalForControlEvents.controlClients ?? new Set<WebSocket>();

if (process.env.NODE_ENV !== "production") {
  globalForControlEvents.controlClients = clients;
}

export function registerControlClient(ws: WebSocket) {
  clients.add(ws);
}

export function unregisterControlClient(ws: WebSocket) {
  clients.delete(ws);
}

export function sendControlMessage(ws: WebSocket, message: ControlServerMessage) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(message));
}

export function broadcastControlState(state: DisplayControlResponse) {
  for (const client of clients) {
    sendControlMessage(client, { type: "CONTROL_STATE_CHANGED", state });
  }
}

export function parseControlMessage(data: RawData): ControlClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as Partial<ControlClientMessage>;

    if (parsed.type === "SYNC") return { type: "SYNC" };
    if (parsed.type === "PING" && typeof parsed.id === "number") {
      return { type: "PING", id: parsed.id };
    }

    return null;
  } catch {
    return null;
  }
}
