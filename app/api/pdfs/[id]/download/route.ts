import { mediaDownloadResponse } from "@/lib/media-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Params) {
  const { id } = await context.params;
  return mediaDownloadResponse(request, id, "PDF");
}
