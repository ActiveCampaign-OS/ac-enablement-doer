import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getPrisma } from '@/lib/prisma'
import { StatusChip } from '../StatusChip'
import { RequestActions } from './RequestActions'
import { ThreadPanel } from './ThreadPanel'
import { JiraWorkItem } from './JiraWorkItem'
import { RequestDoodle } from './RequestDoodle'
import { AssetBuildPanel } from './AssetBuildPanel'
import { DataWizardBrief } from './DataWizardBrief'
import { DELIVERABLE_AUTONOMY } from '@/lib/state-machine'
import { buildDataWizardBrief } from '@/lib/data-wizard'
import { canAccessRequest } from '@/lib/permissions'
import type { DeliverableType } from '@prisma/client'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

interface Recommendation {
  deliverableType: string
  supportRoute?: string
  rationale: string
  nextStep?: string
  confidence: number
  effort?: { size?: string; hours?: number }
}

interface WorkingNotes {
  businessGoal?: string | null
  targetBehavior?: string | null
  likelyGapTypes?: string[]
  keyEvidence?: string[]
  openRisks?: string[]
  nextDecision?: string | null
}

function RequestBriefItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="font-black uppercase text-xs tracking-wide text-[#625d53]">{label}</dt>
      <dd className="font-semibold whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

function requestTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    HELP_ME_DIAGNOSE: 'Help me diagnose the right support',
    SELF_SERVE_RESOURCE: 'Find or share a self-serve resource',
    COACHING_SUPPORT: 'Support managers with coaching',
    ENABLEMENT_PARTNERSHIP: 'Explore an Enablement partnership',
    OTHER: 'Something else',
  }
  return labels[value] ?? value
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({
    where: { id },
    include: {
      assessments: { orderBy: { version: 'desc' } },
      messages: { orderBy: { createdAt: 'asc' } },
      actions: { orderBy: { createdAt: 'asc' } },
      assetBuilds: {
        orderBy: { revision: 'desc' },
        include: { artifacts: { orderBy: { createdAt: 'desc' } } },
      },
    },
  })
  if (!request) notFound()

  const h = await headers()
  const email = (h.get('x-auth-request-email') || h.get('cf-access-authenticated-user-email') || '').trim().toLowerCase()
  if (!canAccessRequest(email || null, request.requesterEmail)) notFound()

  const latest = request.assessments[0] ?? null
  const recs = (latest?.recommendations ?? []) as unknown as Recommendation[]
  const workingNotes = (latest?.workingNotes ?? null) as WorkingNotes | null
  const effectiveType = (request.confirmedType ?? request.recommendedType) as DeliverableType | null
  const handoff = effectiveType ? DELIVERABLE_AUTONOMY[effectiveType] === 'HUMAN_HANDOFF' : false
  const assetBuild = request.assetBuilds[0] ?? null
  const dataWizardBrief = buildDataWizardBrief({
    title: request.title,
    description: request.description,
    requestType: request.requestType,
    businessImpact: request.businessImpact ?? request.businessGoal,
    successMeasures: request.successMeasures,
    desiredBehavior: request.desiredBehavior,
    audience: request.audience,
    urgency: request.urgency,
  })

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-8">
      <header className="nb-panel p-5 sm:p-7 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <span className="nb-kicker">Request file</span>
            <h1 className="text-4xl font-black uppercase tracking-[-0.07em] leading-none break-words">
              {request.title}
            </h1>
          </div>
          <StatusChip status={request.status} />
        </div>
        <p className="border-y-3 border-black py-3 text-xs font-bold uppercase tracking-wide text-[#5f594f]">
          {request.requesterEmail}
          {request.dueDate ? ` · due ${request.dueDate.toISOString().slice(0, 10)}` : ''}
          {request.assignedTo ? ` · assigned to ${request.assignedTo}` : ''}
        </p>
        <p className="font-semibold whitespace-pre-wrap">{request.description}</p>
        {(request.jiraIssueKey || request.jiraSyncStatus !== 'PENDING' || request.jiraSyncError) && (
          <JiraWorkItem
            requestId={request.id}
            requestStatus={request.status}
            initialState={{
              jiraIssueKey: request.jiraIssueKey,
              jiraIssueUrl: request.jiraIssueUrl,
              jiraSyncStatus: request.jiraSyncStatus,
              jiraSyncError: request.jiraSyncError,
            }}
          />
        )}
      </header>

      <RequestDoodle value={request.pixelDoodle} />

      <DataWizardBrief requestId={request.id} prompt={dataWizardBrief} />

      <section className="nb-panel p-5 sm:p-6 space-y-5">
        <h2 className="nb-section-title">Request brief</h2>
        <dl className="space-y-5">
          <RequestBriefItem label="Situation, challenge, or initiative">
            {request.description}
          </RequestBriefItem>
          {request.requestType && (
            <RequestBriefItem label="Requester starting point">
              {requestTypeLabel(request.requestType)}
            </RequestBriefItem>
          )}
          {request.businessImpact ? (
            <RequestBriefItem label="Business impact">{request.businessImpact}</RequestBriefItem>
          ) : request.businessGoal ? (
            <RequestBriefItem label="Outcomes and success measures">{request.businessGoal}</RequestBriefItem>
          ) : null}
          {request.successMeasures && (
            <RequestBriefItem label="Success measures">{request.successMeasures}</RequestBriefItem>
          )}
          {request.desiredBehavior && (
            <RequestBriefItem label="Desired behavior change">{request.desiredBehavior}</RequestBriefItem>
          )}
          {request.audience && (
            <RequestBriefItem label="Required audience">{request.audience}</RequestBriefItem>
          )}
          {request.urgency && (
            <RequestBriefItem label="Desired timeline">{request.urgency}</RequestBriefItem>
          )}
          {request.dueDate && (
            <RequestBriefItem label="Hard deadline">
              {request.dueDate.toISOString().slice(0, 10)}
            </RequestBriefItem>
          )}
          {request.stakeholders && (
            <RequestBriefItem label="Key stakeholders">{request.stakeholders}</RequestBriefItem>
          )}
          {request.sourceMaterials && (
            <RequestBriefItem label="Existing resources and documentation">
              {request.sourceMaterials}
            </RequestBriefItem>
          )}
          {request.contentLinks.length > 0 && (
            <RequestBriefItem label="Resource links">
              <ul className="space-y-1">
                {request.contentLinks.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      className="font-bold underline decoration-2 underline-offset-2 break-all"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </RequestBriefItem>
          )}
          {request.accountability && (
            <RequestBriefItem label="Next steps and accountability">
              {request.accountability}
            </RequestBriefItem>
          )}
        </dl>
      </section>

      {assetBuild && (
        <AssetBuildPanel
          requestId={request.id}
          build={{
            id: assetBuild.id,
            deliverableType: assetBuild.deliverableType,
            status: assetBuild.status,
            revision: assetBuild.revision,
            attempt: assetBuild.attempt,
            draftTitle: assetBuild.draftTitle,
            draftSummary: assetBuild.draftSummary,
            draftContent: assetBuild.draftContent,
            draftData: assetBuild.draftData,
            error: assetBuild.error,
            artifacts: assetBuild.artifacts.map((artifact) => ({
              id: artifact.id,
              fileName: artifact.fileName,
              kind: artifact.kind,
            })),
          }}
        />
      )}

      {latest && !latest.error && (
        <section className="nb-panel p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="nb-section-title">Assessment v{latest.version}</h2>
            <span className="text-xs font-bold text-[#625d53]">
              {latest.currentStage ? `${latest.currentStage} · ` : ''}{latest.model} · spine {latest.frameworkVersion}
            </span>
          </div>

          {latest.showWorkingNotes && workingNotes && (
            <section className="nb-panel-soft p-4 space-y-3">
              <h3 className="nb-section-title">Working notes</h3>
              <dl className="space-y-3 text-sm">
                {workingNotes.businessGoal && <RequestBriefItem label="Business goal">{workingNotes.businessGoal}</RequestBriefItem>}
                {workingNotes.targetBehavior && <RequestBriefItem label="Target behavior">{workingNotes.targetBehavior}</RequestBriefItem>}
                {(workingNotes.likelyGapTypes?.length ?? 0) > 0 && (
                  <RequestBriefItem label="Likely gap types">{workingNotes.likelyGapTypes?.join(', ')}</RequestBriefItem>
                )}
                {(workingNotes.keyEvidence?.length ?? 0) > 0 && (
                  <RequestBriefItem label="Key evidence">
                    <ul className="list-disc space-y-1 pl-5">
                      {workingNotes.keyEvidence?.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </RequestBriefItem>
                )}
                {(workingNotes.openRisks?.length ?? 0) > 0 && (
                  <RequestBriefItem label="Open risks">
                    <ul className="list-disc space-y-1 pl-5">
                      {workingNotes.openRisks?.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </RequestBriefItem>
                )}
                {workingNotes.nextDecision && <RequestBriefItem label="Next decision">{workingNotes.nextDecision}</RequestBriefItem>}
              </dl>
            </section>
          )}

          {recs.length > 0 ? (
            <div className="space-y-3">
              {recs.map((r, i) => (
                <div key={i} className={i === 0 ? 'border-l-[6px] border-black pl-3' : 'border-l-3 border-black/30 pl-3'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black uppercase text-xs">{i === 0 ? 'Recommended' : 'Alternative'}</span>
                    <span className="font-mono text-xs font-bold bg-[#b7a0ff] border-2 border-black px-2 py-1">
                      {r.deliverableType}
                    </span>
                    {r.supportRoute && (
                      <span className="font-mono text-xs font-bold bg-[#bdf4d2] border-2 border-black px-2 py-1">
                        {r.supportRoute.replaceAll('_', ' ')}
                      </span>
                    )}
                    {DELIVERABLE_AUTONOMY[r.deliverableType as DeliverableType] === 'HUMAN_HANDOFF' && (
                      <span className="nb-status nb-status-handoff">
                        HUMAN BUILD
                      </span>
                    )}
                    <span className="text-xs font-bold text-[#625d53]">
                      {r.confidence}% · ~{r.effort?.hours ?? '?'}h {r.effort?.size ?? ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold mt-2">{r.rationale}</p>
                  {r.nextStep && <p className="text-sm font-semibold mt-2 text-[#625d53]">Next step: {r.nextStep}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-semibold">
              Not enough to recommend yet
              {latest.missingInputs.length ? ` — missing: ${latest.missingInputs.join('; ')}` : ''}.
              Answer the agent&apos;s questions in the thread below.
            </p>
          )}

          {(latest.spineSteps as Array<{ step: string; summary: string }>).length > 0 && (
            <details className="border-t-3 border-black pt-3 text-sm">
              <summary className="cursor-pointer font-black uppercase text-xs tracking-wide">
                Spine walk-through
              </summary>
              <ul className="mt-2 space-y-2">
                {(latest.spineSteps as Array<{ step: string; summary: string }>).map((s, i) => (
                  <li key={i}>
                    <span className="font-black">{s.step}:</span> {s.summary}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <RequestActions
        requestId={request.id}
        status={request.status}
        effectiveType={effectiveType}
        handoff={handoff}
        requesterEmail={request.requesterEmail}
      />

      <ThreadPanel
        requestId={request.id}
        status={request.status}
        messages={request.messages.map((m) => ({
          id: m.id,
          role: m.role,
          author: m.author,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        }))}
      />

      <section className="nb-panel p-5">
        <h2 className="nb-section-title mb-4">Timeline</h2>
        <ul className="space-y-3 text-xs font-semibold">
          {request.actions.map((a) => (
            <li key={a.id} className="nb-timeline-item flex gap-2">
              <span className="text-[#625d53] shrink-0 font-mono">
                {a.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
              </span>
              <span>
                {a.action.replace(/_/g, ' ')}
                {a.actor ? ` — ${a.actor}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
