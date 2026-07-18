import { NextRequest, NextResponse } from 'next/server'
import { putAssetObject } from '@/lib/asset-storage'
import { getPrisma } from '@/lib/prisma'
import { checkOperator, operatorForbidden } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const op = checkOperator(req)
  if (!op.ok) return operatorForbidden(op.email)
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const draftTitle = typeof body.draftTitle === 'string' ? body.draftTitle.trim().slice(0, 180) : null
  const draftContent = typeof body.draftContent === 'string' ? body.draftContent.trim().slice(0, 50_000) : null
  if (!draftTitle || !draftContent) {
    return NextResponse.json({ error: 'draftTitle and draftContent are required' }, { status: 400 })
  }
  const prisma = getPrisma()
  const build = await prisma.assetBuild.findUnique({ where: { id } })
  if (!build) return NextResponse.json({ error: 'Asset build not found' }, { status: 404 })
  if (build.status !== 'DRAFT_READY') {
    return NextResponse.json({ error: 'Only a review-ready draft can be edited' }, { status: 422 })
  }
  const artifact = await prisma.assetArtifact.findFirst({ where: { buildId: id }, orderBy: { createdAt: 'desc' } })
  if (!artifact) return NextResponse.json({ error: 'The draft artifact is missing' }, { status: 422 })
  const content =
    build.deliverableType === 'DECK'
      ? JSON.stringify(
          {
            title: draftTitle,
            summary: build.draftSummary,
            markdown: draftContent,
            slides: (build.draftData as { slides?: unknown[] } | null)?.slides ?? [],
            format: 'enablement-doer-deck-storyboard/v1',
          },
          null,
          2
        )
      : draftContent
  const stored = await putAssetObject({
    requestId: build.requestId,
    buildId: build.id,
    fileName: artifact.fileName,
    content,
    contentType: artifact.contentType,
  })
  const updated = await prisma.$transaction(async (tx) => {
    const revised = await tx.assetBuild.update({
      where: { id },
      data: { draftTitle, draftContent },
    })
    await tx.assetArtifact.update({
      where: { id: artifact.id },
      data: { sizeBytes: stored.sizeBytes, sha256: stored.sha256 },
    })
    await tx.requestAction.create({
      data: {
        requestId: build.requestId,
        action: 'asset_draft_edited',
        actor: op.email,
        source: 'ui',
        metadata: { buildId: build.id },
      },
    })
    return revised
  })
  return NextResponse.json(updated)
}
