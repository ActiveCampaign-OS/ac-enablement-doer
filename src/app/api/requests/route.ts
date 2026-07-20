import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { getActorEmail, checkWrite, writeForbidden } from '@/lib/permissions'
import { runAssessment } from '@/lib/spine/assess'
import { notifySlack, requestBlocks } from '@/lib/slack'
import { parsePixelDoodle } from '@/lib/pixel-doodle'
import type { Prisma, RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function extractLinks(sourceMaterials: string, suppliedLinks: unknown): string[] {
  const embeddedLinks = sourceMaterials.match(/https?:\/\/[^\s<>()]+/g) ?? []
  const links = Array.isArray(suppliedLinks) ? suppliedLinks.map(String) : []
  return Array.from(
    new Set([...links, ...embeddedLinks].map((link) => link.replace(/[.,;!?]+$/, '')).filter(Boolean))
  )
}

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
  const audience = String(body.audience ?? '').trim()
  const businessGoal = String(body.businessGoal ?? '').trim()
  const urgency = String(body.urgency ?? '').trim()
  const stakeholders = String(body.stakeholders ?? '').trim()
  const sourceMaterials = String(body.sourceMaterials ?? '').trim()
  const accountability = String(body.accountability ?? '').trim()
  const pixelDoodle = parsePixelDoodle(body.pixelDoodle)
  const missingFields = [
    { value: title, label: 'request title' },
    { value: description, label: 'situation, challenge, or initiative' },
    { value: businessGoal, label: 'outcomes and success measures' },
    { value: audience, label: 'required audience' },
    { value: urgency, label: 'desired timeline' },
    { value: stakeholders, label: 'key stakeholders' },
    { value: sourceMaterials, label: 'existing resources or documentation' },
    { value: accountability, label: 'next steps and accountability' },
  ]
    .filter((field) => !field.value)
    .map((field) => field.label)
  if (missingFields.length) {
    return NextResponse.json({ error: `Required: ${missingFields.join(', ')}` }, { status: 400 })
  }
  if (title.length > 250) {
    return NextResponse.json({ error: 'request title must be 250 characters or fewer' }, { status: 400 })
  }

  const dueDateValue = String(body.dueDate ?? '').trim()
  const dueDate = dueDateValue ? new Date(dueDateValue) : null
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'due date must be a valid date' }, { status: 400 })
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
      audience,
      businessGoal,
      urgency,
      stakeholders,
      sourceMaterials,
      accountability,
      dueDate,
      contentLinks: extractLinks(sourceMaterials, body.contentLinks),
      ...(pixelDoodle ? { pixelDoodle: pixelDoodle as unknown as Prisma.InputJsonValue } : {}),
      jiraSyncStatus: 'QUEUED',
      actions: {
        create: { action: 'submitted', actor: email, source: 'ui' },
      },
    },
  })

  after(async () => {
    await notifySlack(requestBlocks('New training request', request, `Submitted by ${email}`)).catch((error) => {
      console.error('[requests] new-request Slack notification failed', error)
    })
    await runAssessment(request.id, 'system')
  })

  return NextResponse.json(request, { status: 201 })
}
