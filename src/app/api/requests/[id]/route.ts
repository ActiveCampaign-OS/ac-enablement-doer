import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { canAccessRequest, getActorEmail, checkWrite, writeForbidden, checkOperator, operatorForbidden } from '@/lib/permissions'
import { DECLINE_CATEGORIES, DELIVERABLE_AUTONOMY, canTransition } from '@/lib/state-machine'
import type { DeliverableType } from '@prisma/client'
import type { DeclineCategory as DC } from '@/lib/state-machine'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({
    where: { id },
    include: {
      assessments: { orderBy: { version: 'desc' } },
      messages: { orderBy: { createdAt: 'asc' } },
      actions: { orderBy: { createdAt: 'asc' } },
      feedback: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessRequest(getActorEmail(req), request.requesterEmail)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(request)
}

// PATCH /api/requests/[id]
//  - decline:  { decline: { category, reason } }  (the ONLY path to DECLINED)
//  - operator override: { confirmedType, overrideReason }
//  - assignment: { assignedTo }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const perm = checkWrite(req)
  if (!perm.ok) return writeForbidden(perm.email)

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const actor = getActorEmail(req)
  const prisma = getPrisma()

  const request = await prisma.trainingRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessRequest(actor, request.requesterEmail)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // --- Decline (requires category + reason; writes RequestFeedback) ---
  if (body.decline) {
    const category = String(body.decline.category ?? '')
    const reason = String(body.decline.reason ?? '').trim()
    if (!DECLINE_CATEGORIES.includes(category as DC) || !reason) {
      return NextResponse.json(
        {
          error: `decline requires category (one of ${DECLINE_CATEGORIES.join(', ')}) and a non-empty reason`,
        },
        { status: 400 }
      )
    }
    if (!canTransition(request.status, 'DECLINED')) {
      return NextResponse.json(
        { error: `Cannot decline from ${request.status}` },
        { status: 422 }
      )
    }
    const updated = await prisma.trainingRequest.update({
      where: { id },
      data: {
        status: 'DECLINED',
        lastActivityAt: new Date(),
        feedback: { create: { category, reason, actor } },
        actions: {
          create: {
            action: 'status_changed_to_DECLINED',
            actor,
            source: 'ui',
            metadata: { previousStatus: request.status, category, reason },
          },
        },
      },
    })
    return NextResponse.json(updated)
  }

  // --- Operator override of the confirmed deliverable type ---
  if (body.confirmedType) {
    const op = checkOperator(req)
    if (!op.ok) return operatorForbidden(op.email)

    const confirmedType = String(body.confirmedType) as DeliverableType
    if (!(confirmedType in DELIVERABLE_AUTONOMY)) {
      return NextResponse.json({ error: `unknown deliverable type ${confirmedType}` }, { status: 400 })
    }
    const overrideReason = String(body.overrideReason ?? '').trim()
    const isOverride = request.recommendedType && confirmedType !== request.recommendedType
    if (isOverride && !overrideReason) {
      return NextResponse.json(
        { error: 'overrideReason is required when overriding the recommendation' },
        { status: 400 }
      )
    }
    const updated = await prisma.trainingRequest.update({
      where: { id },
      data: {
        confirmedType,
        autonomy: DELIVERABLE_AUTONOMY[confirmedType],
        overrideReason: isOverride ? overrideReason : request.overrideReason,
        lastActivityAt: new Date(),
        ...(isOverride
          ? {
              feedback: {
                create: {
                  category: 'wrong_deliverable',
                  reason: `Operator override: ${request.recommendedType} → ${confirmedType}. ${overrideReason}`,
                  actor,
                },
              },
            }
          : {}),
        actions: {
          create: {
            action: isOverride ? 'recommendation_overridden' : 'deliverable_confirmed_type_set',
            actor,
            source: 'ui',
            metadata: { from: request.recommendedType, to: confirmedType },
          },
        },
      },
    })
    return NextResponse.json(updated)
  }

  // --- Assignment ---
  if ('assignedTo' in body) {
    const op = checkOperator(req)
    if (!op.ok) return operatorForbidden(op.email)
    const assignedTo = body.assignedTo ? String(body.assignedTo).trim().toLowerCase() : null
    const updated = await prisma.trainingRequest.update({
      where: { id },
      data: {
        assignedTo,
        lastActivityAt: new Date(),
        actions: {
          create: {
            action: assignedTo ? 'assigned' : 'unassigned',
            actor,
            source: 'ui',
            metadata: { assignedTo },
          },
        },
      },
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json(
    { error: 'nothing to do — send decline{}, confirmedType, or assignedTo' },
    { status: 400 }
  )
}
