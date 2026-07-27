-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'PDF', 'OTHER');

-- CreateEnum
CREATE TYPE "ControlKind" AS ENUM ('PAGE_SEQUENCE', 'VIDEO');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "controlKind" "ControlKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "activeIndex" INTEGER NOT NULL DEFAULT 0,
    "activeItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaGroupItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayControlState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "activeGroupId" TEXT,
    "currentPosition" INTEGER NOT NULL DEFAULT 0,
    "videoPlaying" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayControlState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectName_key" ON "MediaAsset"("objectName");

-- CreateIndex
CREATE INDEX "MediaAsset_mediaType_idx" ON "MediaAsset"("mediaType");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaGroup_slug_key" ON "MediaGroup"("slug");

-- CreateIndex
CREATE INDEX "MediaGroup_sortOrder_idx" ON "MediaGroup"("sortOrder");

-- CreateIndex
CREATE INDEX "MediaGroup_activeItemId_idx" ON "MediaGroup"("activeItemId");

-- CreateIndex
CREATE INDEX "MediaGroupItem_groupId_position_idx" ON "MediaGroupItem"("groupId", "position");

-- CreateIndex
CREATE INDEX "MediaGroupItem_assetId_idx" ON "MediaGroupItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaGroupItem_groupId_assetId_key" ON "MediaGroupItem"("groupId", "assetId");

-- AddForeignKey
ALTER TABLE "MediaGroupItem" ADD CONSTRAINT "MediaGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MediaGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaGroupItem" ADD CONSTRAINT "MediaGroupItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaGroup" ADD CONSTRAINT "MediaGroup_activeItemId_fkey" FOREIGN KEY ("activeItemId") REFERENCES "MediaGroupItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayControlState" ADD CONSTRAINT "DisplayControlState_activeGroupId_fkey" FOREIGN KEY ("activeGroupId") REFERENCES "MediaGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
