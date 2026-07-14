-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'ASSESSING', 'NEEDS_INFO', 'RECOMMENDED', 'CONFIRMED', 'GENERATING', 'DRAFT_READY', 'HANDOFF_REQUIRED', 'APPROVED', 'DELIVERED', 'DECLINED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DeliverableType" AS ENUM ('JOB_AID', 'MANAGER_GUIDE', 'DECK', 'SOLIDROAD_SIM_SPEC', 'RISE_COURSE', 'OTHER');

-- CreateEnum
CREATE TYPE "Autonomy" AS ENUM ('AUTONOMOUS', 'HUMAN_HANDOFF');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('STAKEHOLDER', 'AGENT', 'OPERATOR');

-- CreateTable
CREATE TABLE "TrainingRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "audience" TEXT,
    "businessGoal" TEXT,
    "urgency" TEXT,
    "dueDate" TIMESTAMP(3),
    "contentLinks" TEXT[],
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "recommendedType" "DeliverableType",
    "autonomy" "Autonomy",
    "confirmedType" "DeliverableType",
    "assignedTo" TEXT,
    "overrideReason" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNudgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "frameworkVersion" TEXT NOT NULL,
    "sufficient" BOOLEAN NOT NULL,
    "missingInputs" TEXT[],
    "spineSteps" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "scopingQuestions" TEXT[],
    "rawExcerpt" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestAction" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "source" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestFeedback" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkDoc" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrameworkDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingRequest_status_idx" ON "TrainingRequest"("status");

-- CreateIndex
CREATE INDEX "TrainingRequest_requesterEmail_idx" ON "TrainingRequest"("requesterEmail");

-- CreateIndex
CREATE INDEX "TrainingRequest_createdAt_idx" ON "TrainingRequest"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Assessment_requestId_version_idx" ON "Assessment"("requestId", "version" DESC);

-- CreateIndex
CREATE INDEX "RequestMessage_requestId_createdAt_idx" ON "RequestMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestAction_requestId_idx" ON "RequestAction"("requestId");

-- CreateIndex
CREATE INDEX "RequestFeedback_category_createdAt_idx" ON "RequestFeedback"("category", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkDoc_contentHash_key" ON "FrameworkDoc"("contentHash");

-- CreateIndex
CREATE INDEX "FrameworkDoc_fetchedAt_idx" ON "FrameworkDoc"("fetchedAt" DESC);

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TrainingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TrainingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAction" ADD CONSTRAINT "RequestAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TrainingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFeedback" ADD CONSTRAINT "RequestFeedback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TrainingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

