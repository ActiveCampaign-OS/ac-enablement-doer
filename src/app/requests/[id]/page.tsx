import { notFound } from 'next/navigation'
import { getPrisma } from '@/lib/prisma'
import { StatusChip } from '../StatusChip'
import { RequestActions } from './RequestActions'
import { ThreadPanel } from './ThreadPanel'
import { DELIVERABLE_AUTONOMY } from '@/lib/state-machine'
import type { DeliverableType } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface Recommendation {
  deliverableType: string
  rationale: string
  confidence: number
  effort?: { size?: string; hours?: number }
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
    },
  })
  if (!request) notFound()

  const latest = request.assessments[0] ?? null
  const recs = (latest?.recommendations ?? []) as unknown as Recommendation[]
  const effectiveType = (request.confirmedType ?? request.recommendedType) as DeliverableType | null
  const handoff = effectiveType ? DELIVERABLE_AUTONOMY[effectiveType] === 'HUMAN_HANDOFF' : false

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{request.title}</h1>
          <StatusChip status={request.status} />
        </div>
        <p className="text-sm text-charcoal-400">
          {request.requesterEmail}
          {request.audience ? ` · for ${request.audience}` : ''}
          {request.dueDate ? ` · due ${request.dueDate.toISOString().slice(0, 10)}` : ''}
          {request.assignedTo ? ` · assigned to ${request.assignedTo}` : ''}
        </p>
        <p className="text-charcoal-200 whitespace-pre-wrap">{request.description}</p>
        {request.businessGoal && (
          <p className="text-sm text-charcoal-300">
            <span className="font-medium text-charcoal-200">Business goal:</span> {request.businessGoal}
          </p>
        )}
        {request.contentLinks.length > 0 && (
          <ul className="text-sm space-y-0.5">
            {request.contentLinks.map((l) => (
              <li key={l}>
                <a href={l} className="text-ac-blue-400 hover:underline break-all" target="_blank" rel="noreferrer">
                  {l}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      {latest && !latest.error && (
        <section className="border border-charcoal-800 rounded-3 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-charcoal-300 uppercase tracking-wide">
              Assessment v{latest.version}
            </h2>
            <span className="text-xs text-charcoal-500">
              {latest.model} · spine {latest.frameworkVersion}
            </span>
          </div>

          {recs.length > 0 ? (
            <div className="space-y-3">
              {recs.map((r, i) => (
                <div key={i} className={i === 0 ? '' : 'opacity-70'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{i === 0 ? 'Recommended:' : 'Alternative:'}</span>
                    <span className="font-mono text-sm bg-charcoal-900 border border-charcoal-700 rounded px-2 py-0.5">
                      {r.deliverableType}
                    </span>
                    {DELIVERABLE_AUTONOMY[r.deliverableType as DeliverableType] === 'HUMAN_HANDOFF' && (
                      <span className="text-[11px] font-semibold bg-orange-900 text-orange-300 rounded-full px-2 py-0.5">
                        HUMAN BUILD
                      </span>
                    )}
                    <span className="text-xs text-charcoal-400">
                      {r.confidence}% · ~{r.effort?.hours ?? '?'}h {r.effort?.size ?? ''}
                    </span>
                  </div>
                  <p className="text-sm text-charcoal-300 mt-1">{r.rationale}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-charcoal-300">
              Not enough to recommend yet
              {latest.missingInputs.length ? ` — missing: ${latest.missingInputs.join('; ')}` : ''}.
              Answer the agent&apos;s questions in the thread below.
            </p>
          )}

          {(latest.spineSteps as Array<{ step: string; summary: string }>).length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-charcoal-400 hover:text-charcoal-200">
                Spine walk-through
              </summary>
              <ul className="mt-2 space-y-2">
                {(latest.spineSteps as Array<{ step: string; summary: string }>).map((s, i) => (
                  <li key={i}>
                    <span className="font-medium text-charcoal-200">{s.step}:</span>{' '}
                    <span className="text-charcoal-300">{s.summary}</span>
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

      <section>
        <h2 className="text-sm font-semibold text-charcoal-300 uppercase tracking-wide mb-3">Timeline</h2>
        <ul className="space-y-1.5 text-xs text-charcoal-400">
          {request.actions.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="text-charcoal-500 shrink-0 font-mono">
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
