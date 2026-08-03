import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { canAccessRequest, getActorEmail, checkWrite, writeForbidden, checkOperator, operatorForbidden } from '@/lib/permissions'
import { STATUS_TRANSITIONS, DELIVERABLE_AUTONOMY, canTransition } from '@/lib/state-machine'
import { notifySlack, requestBlocks } from '@/lib/slack'
import { createJiraIssueForRequest } from '@/lib/jira'
import { logOutcome } from '@/lib/outcomes'
import type { DeliverableType, RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = Object.keys(STATUS_TRANSITIONS) as RequestStatus[]

// Statuses only an operator may set (approval / delivery of handoffs).
const OPERATOR_STATUSES: RequestStatus[] = ['APPROVED', 'DELIVERED']

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
  if (!canAccessRequest(actor, request.requesterEmail)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'DATA_WIZARD_BRIEF_PREPARED') {
    const op = checkOperator(req)
    if (!op.ok) return operatorForbidden(op.email)
    const recorded = await prisma.requestAction.create({
      data: {
        requestId: id,
        action: 'data_wizard_brief_prepared',
        actor,
        source: 'ui',
        metadata: { provider: 'Glean StratOps Data Wizard', briefVersion: 1, queryExecuted: false },
      },
    })
    return NextResponse.json({ ok: true, action: recorded.action })
  }

  if (action === 'RETRY_JIRA_SYNC') {
    if (request.jiraIssueKey) {
      return NextResponse.json({ ok: true, alreadyCreated: true, jiraIssueKey: request.jiraIssueKey })
    }
    if (!['FAILED', 'PENDING_APPROVAL'].includes(request.jiraSyncStatus)) {
      return NextResponse.json({ error: `Jira sync cannot be retried from ${request.jiraSyncStatus}` }, { status: 422 })
    }
    const queued = await prisma.$transaction(async (tx) => {
      const claimed = await tx.trainingRequest.updateMany({
        where: { id, jiraIssueKey: null, jiraSyncStatus: request.jiraSyncStatus },
        data: { jiraSyncStatus: 'QUEUED', jiraSyncError: null },
      })
      if (claimed.count !== 1) return false
      await tx.requestAction.create({
        data: {
          requestId: id,
          action: 'jira_issue_retry_queued',
          actor,
          source: 'ui',
          metadata: { previousStatus: request.jiraSyncStatus },
        },
      })
      return true
    })
    if (!queued) {
      return NextResponse.json({ error: 'Jira sync changed before it could be retried' }, { status: 409 })
    }
    after(async () => {
      await createJiraIssueForRequest(id)
    })
    return NextResponse.json({ ok: true, jiraSyncStatus: 'QUEUED' }, { status: 202 })
  }

  if (action === 'RETRY_ASSET_BUILD' || action === 'REGENERATE_ASSET_BUILD') {
    const op = checkOperator(req)
    if (!op.ok) return operatorForbidden(op.email)
    const buildId = String(body.buildId ?? '')
    const build = await prisma.assetBuild.findFirst({
      where: { id: buildId, requestId: id },
      orderBy: { revision: 'desc' },
    })
    if (!build) return NextResponse.json({ error: 'Asset build not found' }, { status: 404 })

    if (action === 'RETRY_ASSET_BUILD') {
      if (build.status !== 'FAILED' || request.status !== 'CONFIRMED') {
        return NextResponse.json({ error: 'Only a failed, confirmed build can be retried' }, { status: 422 })
      }
      await prisma.$transaction(async (tx) => {
        await tx.assetBuild.update({
          where: { id: build.id },
          data: { status: 'QUEUED', error: null, workerId: null, startedAt: null, heartbeatAt: null, completedAt: null },
        })
        await tx.trainingRequest.update({
          where: { id },
          data: {
            status: 'GENERATING',
            lastActivityAt: new Date(),
            actions: {
              create: {
                action: 'asset_build_retried',
                actor,
                source: 'ui',
                metadata: { buildId: build.id, revision: build.revision },
              },
            },
          },
        })
      })
      return NextResponse.json({ ok: true, buildId: build.id, status: 'QUEUED' })
    }

    if (build.status !== 'DRAFT_READY' || request.status !== 'DRAFT_READY') {
      return NextResponse.json({ error: 'Only a review-ready build can be regenerated' }, { status: 422 })
    }
    const created = await prisma.$transaction(async (tx) => {
      const next = await tx.assetBuild.create({
        data: {
          requestId: id,
          deliverableType: build.deliverableType,
          revision: build.revision + 1,
          status: 'QUEUED',
        },
      })
      await tx.trainingRequest.update({
        where: { id },
        data: {
          status: 'GENERATING',
          lastActivityAt: new Date(),
          actions: {
            create: {
              action: 'asset_build_regenerated',
              actor,
              source: 'ui',
              metadata: { fromBuildId: build.id, buildId: next.id, revision: next.revision },
            },
          },
        },
      })
      return next
    })
    return NextResponse.json({ ok: true, buildId: created.id, status: 'QUEUED' })
  }

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

    if (nextStatus === 'GENERATING' || nextStatus === 'DRAFT_READY') {
      return NextResponse.json(
        { error: `${nextStatus} is managed by the asset builder and cannot be set directly.` },
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
    let assetBuildQueued = false
    let selfServeDelivered = false
    let confirmedType: DeliverableType | null = null
    if (nextStatus === 'CONFIRMED') {
      confirmedType = request.confirmedType ?? request.recommendedType
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
      } else if (confirmedType === 'SELF_SERVE_RESOURCE') {
        nextStatus = 'DELIVERED'
        selfServeDelivered = true
      } else {
        nextStatus = 'GENERATING'
        assetBuildQueued = true
      }
    }

    const updated = assetBuildQueued && confirmedType
      ? await prisma.$transaction(async (tx) => {
          const claimed = await tx.trainingRequest.updateMany({
            where: { id, status: request.status },
            data: { status: 'GENERATING', lastActivityAt: new Date(), ...extraData },
          })
          if (claimed.count !== 1) return null
          const previousBuild = await tx.assetBuild.findFirst({
            where: { requestId: id, deliverableType: confirmedType },
            orderBy: { revision: 'desc' },
            select: { revision: true },
          })
          const build = await tx.assetBuild.create({
            data: {
              requestId: id,
              deliverableType: confirmedType,
              revision: (previousBuild?.revision ?? 0) + 1,
              status: 'QUEUED',
            },
          })
          return tx.trainingRequest.update({
            where: { id },
            data: {
              actions: {
                create: {
                  action: 'asset_build_queued',
                  actor,
                  source: 'ui',
                  metadata: { previousStatus: request.status, requested: action, buildId: build.id, ...body.metadata },
                },
              },
            },
          })
        })
      : await prisma.trainingRequest.update({
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
    if (!updated) {
      return NextResponse.json({ error: 'Request changed before the build could be queued. Refresh and try again.' }, { status: 409 })
    }

    if (nextStatus === 'APPROVED' && request.status === 'DRAFT_READY') {
      await prisma.assetBuild.updateMany({
        where: { requestId: id, status: 'DRAFT_READY' },
        data: { status: 'APPROVED' },
      })
    }
    if (nextStatus === 'DELIVERED' && request.status === 'APPROVED') {
      await prisma.assetBuild.updateMany({
        where: { requestId: id, status: 'APPROVED' },
        data: { status: 'DELIVERED' },
      })
    }

    after(async () => {
      if (handoffCreated) {
        const notifications = await Promise.allSettled([
          notifySlack(
            requestBlocks('Human build needed', updated, `${updated.confirmedType} confirmed by ${actor ?? 'stakeholder'} — needs an operator`)
          ),
          createJiraIssueForRequest(id),
        ])
        for (const notification of notifications) {
          if (notification.status === 'rejected') console.error('[requests] handoff notification failed', notification.reason)
        }
        await logOutcome('training-handoff-created', {
          requestId: id,
          deliverableType: updated.confirmedType,
        })
      } else if (assetBuildQueued) {
        await notifySlack(
          requestBlocks('Asset build queued', updated, `${updated.confirmedType} confirmed by ${actor ?? 'stakeholder'} — worker will create the draft`)
        )
        await logOutcome('training-request-confirmed', {
          requestId: id,
          deliverableType: updated.confirmedType,
        })
      } else if (nextStatus === 'DELIVERED') {
        await notifySlack(
          requestBlocks(
            selfServeDelivered ? 'Self-serve route confirmed' : 'Delivered',
            updated,
            selfServeDelivered
              ? `Confirmed by ${actor ?? 'stakeholder'} — no new Enablement asset was needed.`
              : `Marked delivered by ${actor ?? 'operator'}`
          )
        )
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
