import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { getActorEmail, checkWrite, writeForbidden, checkOperator, operatorForbidden } from '@/lib/permissions'
import { STATUS_TRANSITIONS, DELIVERABLE_AUTONOMY, canTransition } from '@/lib/state-machine'
import { notifySlack, requestBlocks } from '@/lib/slack'
import { logOutcome } from '@/lib/outcomes'
import type { RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = Object.keys(STATUS_TRANSITIONS) as RequestStatus[]

// Statuses only an operator may set (approval / delivery of handoffs).
const OPERATOR_STATUSES: RequestStatus[] = ['APPROVED', 'DELIVERED', 'GENERATING', 'DRAFT_READY']

// POST /api/requests/[id]/action  { action: <status or custom>, metadata? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const perm = checkWrite(req)
  if (!perm.ok) return writeForbidden(perm.email)

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const actor = getActorEmail(req)
  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (VALID_STATUSES.includes(action as RequestStatus)) {
    let nextStatus = action as RequestStatus

    // Declines MUST carry a reason so the feedback loop has a training
    // signal. This quick-action route can't collect one — route declines
    // through PATCH /api/requests/[id] (decline.category + decline.reason).
    if (nextStatus === 'DECLINED') {
      return NextResponse.json(
        {
          error:
            'Declines require a reason. Use PATCH /api/requests/[id] with decline: { category, reason }.',
        },
        { status: 400 }
      )
    }

    if (OPERATOR_STATUSES.includes(nextStatus)) {
      const op = checkOperator(req)
      if (!op.ok) return operatorForbidden(op.email)
    }

    if (!canTransition(request.status, nextStatus)) {
      return NextResponse.json(
        { error: `Cannot transition from ${request.status} to ${nextStatus}` },
        { status: 422 }
      )
    }

    // Confirming: pin the confirmed deliverable type (stakeholder accepts the
    // recommendation as-is unless an operator already overrode it), and derive
    // the autonomy gate server-side. HUMAN_HANDOFF confirms route straight to
    // the operator queue.
    const extraData: Record<string, unknown> = {}
    let handoffCreated = false
    if (nextStatus === 'CONFIRMED') {
      const confirmedType = request.confirmedType ?? request.recommendedType
      if (!confirmedType) {
        return NextResponse.json(
          { error: 'Cannot confirm: no recommended deliverable type on this request yet' },
          { status: 422 }
        )
      }
      const autonomy = DELIVERABLE_AUTONOMY[confirmedType]
      extraData.confirmedType = confirmedType
      extraData.autonomy = autonomy
      if (autonomy === 'HUMAN_HANDOFF') {
        nextStatus = 'HANDOFF_REQUIRED' // CONFIRMED → HANDOFF_REQUIRED collapsed into one step
        handoffCreated = true
      }
    }

    const updated = await prisma.trainingRequest.update({
      where: { id },
      data: {
        status: nextStatus,
        lastActivityAt: new Date(),
        ...extraData,
        actions: {
          create: {
            action: `status_changed_to_${nextStatus}`,
            actor,
            source: 'ui',
            metadata: { previousStatus: request.status, requested: action, ...body.metadata },
          },
        },
      },
    })

    after(async () => {
      if (handoffCreated) {
        await notifySlack(
          requestBlocks('Human build needed', updated, `${updated.confirmedType} confirmed by ${actor ?? 'stakeholder'} — needs an operator`)
        )
        await logOutcome('training-handoff-created', {
          requestId: id,
          deliverableType: updated.confirmedType,
        })
      } else if (nextStatus === 'CONFIRMED') {
        await notifySlack(
          requestBlocks('Request confirmed', updated, `${updated.confirmedType} confirmed by ${actor ?? 'stakeholder'}`)
        )
        await logOutcome('training-request-confirmed', {
          requestId: id,
          deliverableType: updated.confirmedType,
        })
      } else if (nextStatus === 'DELIVERED') {
        await notifySlack(requestBlocks('Delivered', updated, `Marked delivered by ${actor ?? 'operator'}`))
        await logOutcome('training-asset-delivered', {
          requestId: id,
          deliverableType: updated.confirmedType,
        })
      }
    })

    return NextResponse.json(updated)
  }

  // Custom (non-status) actions land in the audit trail only.
  await prisma.requestAction.create({
    data: { requestId: id, action, actor, source: 'ui', metadata: body.metadata ?? {} },
  })
  return NextResponse.json({ ok: true, action })
}
