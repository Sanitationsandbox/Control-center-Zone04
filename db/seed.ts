import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { ControlKind, PrismaClient } from "../lib/generated/prisma/client";

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
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
