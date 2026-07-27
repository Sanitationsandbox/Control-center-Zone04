import { mediaGroupResponse } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const groups = await prisma.mediaGroup.findMany({
    include: {
      items: {
        include: { asset: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return json(groups.map(mediaGroupResponse));
}
