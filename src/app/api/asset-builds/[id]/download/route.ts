import { NextRequest, NextResponse } from 'next/server'
import { getAssetObject } from '@/lib/asset-storage'
import { getPrisma } from '@/lib/prisma'
import { getActorEmail, isOperatorEmail } from '@/lib/permissions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const actor = getActorEmail(req)
  if (!actor) return NextResponse.json({ error: 'SSO identity is required to download an asset' }, { status: 403 })
  const prisma = getPrisma()
  const artifact = await prisma.assetArtifact.findUnique({
    where: { id },
    include: { build: { include: { request: { select: { requesterEmail: true } } } } },
  })
  if (!artifact) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  const { isOperator } = isOperatorEmail(actor)
  if (!isOperator && actor !== artifact.build.request.requesterEmail) {
    return NextResponse.json({ error: 'You do not have access to this asset' }, { status: 403 })
  }
  const bytes = await getAssetObject(artifact.objectKey)
  const body = new Uint8Array(bytes).buffer
  return new NextResponse(body, {
    headers: {
      'Content-Type': artifact.contentType,
      'Content-Disposition': `attachment; filename="${artifact.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
