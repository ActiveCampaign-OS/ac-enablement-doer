import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { getActorEmail, checkWrite, writeForbidden } from '@/lib/permissions'
import { runAssessment } from '@/lib/spine/assess'
import { notifySlack, requestBlocks } from '@/lib/slack'
import type { RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET /api/requests?mine=1|all=1&status=…
export async function GET(req: NextRequest) {
  const prisma = getPrisma()
  const url = new URL(req.url)
  const email = getActorEmail(req)
  const all = url.searchParams.get('all') === '1'
  const status = url.searchParams.get('status') as RequestStatus | null

  const where = {
    ...(all ? {} : email ? { requesterEmail: email } : {}),
    ...(status ? { status } : {}),
  }
  const requests = await prisma.trainingRequest.findMany({
    where,
    orderBy: { lastActivityAt: 'desc' },
    take: 200,
    include: { _count: { select: { messages: true, assessments: true } } },
  })
  return NextResponse.json({ requests, viewer: email })
}

// POST /api/requests — stakeholder intake. Creates SUBMITTED, then kicks the
// first assessment off inside after() so the response returns immediately.
export async function POST(req: NextRequest) {
  const perm = checkWrite(req)
  if (!perm.ok) return writeForbidden(perm.email)

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()
  if (!title || !description) {
    return NextResponse.json({ error: 'title and description are required' }, { status: 400 })
  }

  const email = getActorEmail(req) ?? String(body.requesterEmail ?? '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'no requester identity' }, { status: 400 })
  }

  const prisma = getPrisma()
  const request = await prisma.trainingRequest.create({
    data: {
      title,
      description,
      requesterEmail: email,
      audience: body.audience ? String(body.audience) : null,
      businessGoal: body.businessGoal ? String(body.businessGoal) : null,
      urgency: body.urgency ? String(body.urgency) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      contentLinks: Array.isArray(body.contentLinks)
        ? body.contentLinks.map(String).filter(Boolean)
        : [],
      actions: {
        create: { action: 'submitted', actor: email, source: 'ui' },
      },
    },
  })

  after(async () => {
    await notifySlack(
      requestBlocks('New training request', request, `Submitted by ${email}`)
    )
    await runAssessment(request.id, 'system')
  })

  return NextResponse.json(request, { status: 201 })
}
