CREATE TYPE "AssetBuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'DRAFT_READY', 'APPROVED', 'DELIVERED', 'FAILED');

CREATE TYPE "AssetArtifactKind" AS ENUM ('MARKDOWN', 'DECK_STORYBOARD');

CREATE TABLE "AssetBuild" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "deliverableType" "DeliverableType" NOT NULL,
    "status" "AssetBuildStatus" NOT NULL DEFAULT 'QUEUED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "workerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "draftTitle" TEXT,
    "draftSummary" TEXT,
    "draftContent" TEXT,
    "draftData" JSONB,
    "sourceSnapshot" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetBuild_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetArtifact" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "kind" "AssetArtifactKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetBuild_requestId_deliverableType_revision_key" ON "AssetBuild"("requestId", "deliverableType", "revision");
CREATE INDEX "AssetBuild_status_createdAt_idx" ON "AssetBuild"("status", "createdAt");
CREATE INDEX "AssetBuild_requestId_createdAt_idx" ON "AssetBuild"("requestId", "createdAt" DESC);
CREATE UNIQUE INDEX "AssetArtifact_objectKey_key" ON "AssetArtifact"("objectKey");
CREATE INDEX "AssetArtifact_buildId_createdAt_idx" ON "AssetArtifact"("buildId", "createdAt");

ALTER TABLE "AssetBuild" ADD CONSTRAINT "AssetBuild_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TrainingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetArtifact" ADD CONSTRAINT "AssetArtifact_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "AssetBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
