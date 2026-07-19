import { getPrisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'
import { assetBuildFileName } from '../lib/asset-builds'
import { collectSourceSnapshot, generateAssetDraft } from '../lib/asset-generator'
import { putAssetObject } from '../lib/asset-storage'
import { notifySlack, requestBlocks } from '../lib/slack'

const POLL_MS = 2_000
const HEARTBEAT_MS = 20_000
const RECOVERY_MS = 60_000
const STALE_AFTER_MS = 5 * 60 * 1000
const DATABASE_RETRY_MS = 5_000
const workerId = `asset-builder-${process.pid}`
let draining = false
let activeBuildId: string | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function claimNextBuild() {
  const prisma = getPrisma()
  const candidate = await prisma.assetBuild.findFirst({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  })
  if (!candidate) return null
  const claimed = await prisma.assetBuild.updateMany({
    where: { id: candidate.id, status: 'QUEUED' },
    data: { status: 'RUNNING', attempt: { increment: 1 }, workerId, startedAt: new Date(), heartbeatAt: new Date(), error: null },
  })
  if (claimed.count !== 1) return null
  return prisma.assetBuild.findUnique({
    where: { id: candidate.id },
    include: {
      request: {
        include: {
          assessments: { orderBy: { version: 'desc' }, take: 1 },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  })
}

async function recoverStaleBuilds(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS)
  const prisma = getPrisma()
  const result = await prisma.assetBuild.updateMany({
    where: {
      status: 'RUNNING',
      OR: [{ heartbeatAt: { lt: staleBefore } }, { heartbeatAt: null, startedAt: { lt: staleBefore } }],
    },
    data: { status: 'QUEUED', workerId: null, startedAt: null, heartbeatAt: null },
  })
  if (result.count) console.warn(`[asset-worker] recovered ${result.count} stale build(s)`)
}

function artifactPayload(build: { deliverableType: string }, draft: { title: string; summary: string; markdown: string; slides: unknown[] }) {
  if (build.deliverableType === 'DECK') {
    return {
      content: JSON.stringify(
        { title: draft.title, summary: draft.summary, markdown: draft.markdown, slides: draft.slides, format: 'enablement-doer-deck-storyboard/v1' },
        null,
        2
      ),
      contentType: 'application/json; charset=utf-8',
      kind: 'DECK_STORYBOARD' as const,
    }
  }
  return { content: draft.markdown, contentType: 'text/markdown; charset=utf-8', kind: 'MARKDOWN' as const }
}

async function completeBuild(buildId: string): Promise<void> {
  const prisma = getPrisma()
  const build = await prisma.assetBuild.findUnique({
    where: { id: buildId },
    include: {
      request: {
        include: {
          assessments: { orderBy: { version: 'desc' }, take: 1 },
          messages: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  })
  if (!build || build.status !== 'RUNNING') return
  const latestAssessment = build.request.assessments[0] ?? null
  const sourceSnapshot = await collectSourceSnapshot({
    request: build.request,
    assessment: latestAssessment
      ? {
          currentStage: latestAssessment.currentStage,
          workingNotes: latestAssessment.workingNotes,
          spineSteps: latestAssessment.spineSteps,
          recommendations: latestAssessment.recommendations,
        }
      : null,
    messages: build.request.messages,
  })
  const draft = await generateAssetDraft({ deliverableType: build.deliverableType, sourceSnapshot })
  const payload = artifactPayload(build, draft)
  const fileName = assetBuildFileName(draft.title, build.deliverableType)
  const stored = await putAssetObject({
    requestId: build.requestId,
    buildId: build.id,
    fileName,
    content: payload.content,
    contentType: payload.contentType,
  })

  const completed = await prisma.$transaction(async (tx) => {
    const marked = await tx.assetBuild.updateMany({
      where: { id: build.id, status: 'RUNNING' },
      data: {
        status: 'DRAFT_READY',
        completedAt: new Date(),
        heartbeatAt: new Date(),
        draftTitle: draft.title,
        draftSummary: draft.summary,
        draftContent: draft.markdown,
        draftData: { slides: draft.slides } as unknown as Prisma.InputJsonValue,
        sourceSnapshot: sourceSnapshot as unknown as Prisma.InputJsonValue,
      },
    })
    if (marked.count !== 1) return false
    await tx.assetArtifact.create({
      data: {
        buildId: build.id,
        kind: payload.kind,
        fileName,
        contentType: payload.contentType,
        objectKey: stored.objectKey,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
      },
    })
    await tx.trainingRequest.update({
      where: { id: build.requestId },
      data: {
        status: 'DRAFT_READY',
        lastActivityAt: new Date(),
        actions: {
          create: {
            action: 'asset_draft_ready',
            actor: null,
            source: 'system',
            metadata: { buildId: build.id, deliverableType: build.deliverableType, artifact: fileName },
          },
        },
        messages: {
          create: {
            role: 'AGENT',
            author: 'agent',
            body: `Your ${build.deliverableType.replace(/_/g, ' ').toLowerCase()} draft is ready for operator review.`,
            metadata: { buildId: build.id },
          },
        },
      },
    })
    return true
  })
  if (completed) {
    await notifySlack(
      requestBlocks('Asset draft ready', build.request, `${build.deliverableType} draft is ready for operator review.`)
    )
  }
}

async function failBuild(buildId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const prisma = getPrisma()
  const build = await prisma.assetBuild.findUnique({ where: { id: buildId }, include: { request: true } })
  if (!build) return
  await prisma.assetBuild.updateMany({
    where: { id: build.id, status: 'RUNNING' },
    data: { status: 'FAILED', error: message.slice(0, 4_000), completedAt: new Date(), heartbeatAt: new Date() },
  })
  await prisma.trainingRequest.update({
    where: { id: build.requestId },
    data: {
      status: 'CONFIRMED',
      lastActivityAt: new Date(),
      actions: {
        create: {
          action: 'asset_build_failed',
          actor: null,
          source: 'system',
          metadata: { buildId: build.id, deliverableType: build.deliverableType, error: message.slice(0, 500) },
        },
      },
    },
  })
  await notifySlack(
    requestBlocks('Asset build failed', build.request, `${build.deliverableType} draft failed: ${message.slice(0, 180)}`)
  ).catch((notifyError) => console.error('[asset-worker] Slack failure alert failed', notifyError))
}

async function processNextBuild(): Promise<boolean> {
  const build = await claimNextBuild()
  if (!build) return false
  activeBuildId = build.id
  console.log(`[asset-worker] claimed buildId=${build.id} requestId=${build.requestId}`)
  const heartbeat = setInterval(() => {
    void getPrisma().assetBuild.updateMany({
      where: { id: build.id, status: 'RUNNING', workerId },
      data: { heartbeatAt: new Date() },
    }).catch((error) => console.error(`[asset-worker] heartbeat failed buildId=${build.id}`, error))
  }, HEARTBEAT_MS)
  try {
    await completeBuild(build.id)
  } catch (error) {
    console.error(`[asset-worker] build failed buildId=${build.id}`, error)
    await failBuild(build.id, error)
  } finally {
    clearInterval(heartbeat)
    activeBuildId = null
  }
  return true
}

async function shutdown(): Promise<void> {
  if (draining) return
  draining = true
  if (activeBuildId) {
    await getPrisma().assetBuild.updateMany({
      where: { id: activeBuildId, status: 'RUNNING', workerId },
      data: { status: 'QUEUED', workerId: null, startedAt: null, heartbeatAt: null },
    }).catch((error) => console.error('[asset-worker] failed to requeue active build', error))
  }
  await getPrisma().$disconnect().catch(() => {})
  process.exit(0)
}

async function waitForDatabase(): Promise<void> {
  while (!draining) {
    try {
      await recoverStaleBuilds()
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[asset-worker] waiting for database readiness: ${message}`)
      await sleep(DATABASE_RETRY_MS)
    }
  }
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })

async function main(): Promise<void> {
  await waitForDatabase()
  if (draining) return
  let lastRecovery = Date.now()
  while (!draining) {
    if (Date.now() - lastRecovery >= RECOVERY_MS) {
      await recoverStaleBuilds()
      lastRecovery = Date.now()
    }
    const processed = await processNextBuild()
    if (!processed) await sleep(POLL_MS)
  }
}

void main().catch(async (error) => {
  console.error('[asset-worker] fatal error', error)
  await getPrisma().$disconnect().catch(() => {})
  process.exit(1)
})
