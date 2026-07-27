import { registerStreamClient } from "@/lib/broadcast";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let unregister = () => {};

  const stream = new ReadableStream({
    start(controller) {
      unregister = registerStreamClient(controller);
    },
    cancel() {
      unregister();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
