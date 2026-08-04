import { broadcastUpdate } from "@/lib/broadcast";
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

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "field"
  );
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

type CreateBody = {
  displayName?: unknown;
  controlKind?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;

  if (!body || typeof body.displayName !== "string" || !body.displayName.trim()) {
    return json({ error: "displayName is required" }, 400);
  }

  const displayName = body.displayName.trim();
  const controlKind = body.controlKind === "VIDEO" ? "VIDEO" : "PAGE_SEQUENCE";

  const baseSlug = slugify(displayName);
  let slug = baseSlug;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.mediaGroup.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const lastGroup = await prisma.mediaGroup.findFirst({ orderBy: { sortOrder: "desc" } });
  const sortOrder = (lastGroup?.sortOrder ?? -1) + 1;

  const group = await prisma.mediaGroup.create({
    data: { slug, displayName, controlKind, sortOrder },
  });

  broadcastUpdate("content-updated", { groupAdded: group.slug });

  return json(mediaGroupResponse({ ...group, items: [] }), 201);
}
