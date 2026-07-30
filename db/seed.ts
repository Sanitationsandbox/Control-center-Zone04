import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { ControlKind, PrismaClient } from "../lib/generated/prisma/client";
import { uploadStoredObject } from "../lib/uploads";
import { getMediaType } from "../lib/media";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed media groups");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const groups = [
  {
    slug: "bhrt",
    displayName: "BHRT",
    controlKind: ControlKind.PAGE_SEQUENCE,
    sortOrder: 1,
  },
  {
    slug: "video",
    displayName: "Video",
    controlKind: ControlKind.VIDEO,
    sortOrder: 2,
  },
  {
    slug: "what-lies-inside",
    displayName: "What lies inside?",
    controlKind: ControlKind.PAGE_SEQUENCE,
    sortOrder: 3,
  },
  {
    slug: "use-case",
    displayName: "USE CASE",
    controlKind: ControlKind.PAGE_SEQUENCE,
    sortOrder: 4,
  },
];

const groupSeedFiles: Record<string, { relativePath: string; contentType: string }[]> = {
  bhrt: [{ relativePath: "button01/BHRT.jpeg", contentType: "image/jpeg" }],
  video: [{ relativePath: "video/lastVideo001.mp4", contentType: "video/mp4" }],
  "what-lies-inside": [2, 3, 4, 5, 6, 7, 8].map((n) => ({
    relativePath: `button03/${n}.jpg`,
    contentType: "image/jpeg",
  })),
  "use-case": [9, 10, 11, 12].map((n) => ({
    relativePath: `button04/${n}.jpg`,
    contentType: "image/jpeg",
  })),
};

async function fileFromPublic(relativePath: string, contentType: string): Promise<File> {
  const absolutePath = path.join(process.cwd(), "public", relativePath);
  const buffer = await readFile(absolutePath);
  return new File([buffer], path.basename(relativePath), { type: contentType });
}

async function seedGroupMedia() {
  for (const [slug, files] of Object.entries(groupSeedFiles)) {
    const group = await prisma.mediaGroup.findUniqueOrThrow({ where: { slug } });
    const existingCount = await prisma.mediaGroupItem.count({ where: { groupId: group.id } });

    if (existingCount > 0) {
      console.log(`Skipping seed media for "${slug}" — already has ${existingCount} item(s).`);
      continue;
    }

    console.log(`Seeding ${files.length} asset(s) for "${slug}"...`);
    let position = 0;
    let firstItemId: string | null = null;

    for (const fileSpec of files) {
      const file = await fileFromPublic(fileSpec.relativePath, fileSpec.contentType);
      const stored = await uploadStoredObject(file, slug);
      const asset = await prisma.mediaAsset.create({
        data: {
          originalName: file.name,
          objectName: stored.objectName,
          contentType: stored.contentType,
          size: stored.size,
          mediaType: getMediaType(stored.contentType),
        },
      });

      const item = await prisma.mediaGroupItem.create({
        data: { groupId: group.id, assetId: asset.id, position },
      });

      if (position === 0) firstItemId = item.id;
      position += 1;
    }

    await prisma.mediaGroup.update({
      where: { id: group.id },
      data: { activeIndex: 0, activeItemId: firstItemId },
    });
  }
}

async function main() {
  for (const group of groups) {
    await prisma.mediaGroup.upsert({
      where: { slug: group.slug },
      update: {
        displayName: group.displayName,
        controlKind: group.controlKind,
        sortOrder: group.sortOrder,
      },
      create: group,
    });
  }

  await prisma.displayControlState.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  await seedGroupMedia();
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
