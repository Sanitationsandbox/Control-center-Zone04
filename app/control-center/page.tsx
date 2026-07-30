import { mediaGroupResponse } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { ControlCenter } from "./components/ControlCenter";

export const dynamic = "force-dynamic";

export default async function ControlCenterPage() {
  const [groups, state] = await Promise.all([
    prisma.mediaGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          include: { asset: true },
          orderBy: { position: "asc" },
        },
      },
    }),
    prisma.displayControlState.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    }),
  ]);

  return (
    <ControlCenter
      initialGroups={groups.map(mediaGroupResponse)}
      initialActiveGroupId={state.activeGroupId}
      initialVideoPlaying={state.videoPlaying}
    />
  );
}
