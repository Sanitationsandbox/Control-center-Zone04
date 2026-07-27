type BroadcastEvent = {
  event: string;
  payload: unknown;
};

type StreamController = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();
const globalBroadcast = globalThis as typeof globalThis & {
  mediaStreamClients?: Set<StreamController>;
};

const clients = (globalBroadcast.mediaStreamClients ??= new Set<StreamController>());

function send(controller: StreamController, message: string) {
  controller.enqueue(encoder.encode(message));
}

export function registerStreamClient(controller: StreamController) {
  clients.add(controller);
  send(controller, ": connected\n\n");

  return () => {
    clients.delete(controller);
  };
}

export function broadcastUpdate(event: string, payload: unknown = {}) {
  const message: BroadcastEvent = { event, payload };
  const data = `event: ${event}\ndata: ${JSON.stringify(message)}\n\n`;

  for (const client of clients) {
    try {
      send(client, data);
    } catch {
      clients.delete(client);
    }
  }
}
