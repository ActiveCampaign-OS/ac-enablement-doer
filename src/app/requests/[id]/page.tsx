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
          {request.audience ? ` · for ${request.audience}` : ''}
          {request.dueDate ? ` · due ${request.dueDate.toISOString().slice(0, 10)}` : ''}
          {request.assignedTo ? ` · assigned to ${request.assignedTo}` : ''}
        </p>
        <p className="font-semibold whitespace-pre-wrap">{request.description}</p>
        {request.businessGoal && (
          <p className="text-sm font-semibold">
            <span className="font-black uppercase">Business goal:</span> {request.businessGoal}
          </p>
        )}
        {request.contentLinks.length > 0 && (
          <ul className="nb-panel-soft p-4 text-sm space-y-1">
            {request.contentLinks.map((l) => (
              <li key={l}>
                <a href={l} className="font-bold underline decoration-2 underline-offset-2 break-all" target="_blank" rel="noreferrer">
                  {l}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      {latest && !latest.error && (
        <section className="nb-panel p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="nb-section-title">Assessment v{latest.version}</h2>
            <span className="text-xs font-bold text-[#625d53]">
              {latest.model} · spine {latest.frameworkVersion}
            </span>
          </div>

          {recs.length > 0 ? (
            <div className="space-y-3">
              {recs.map((r, i) => (
                <div key={i} className={i === 0 ? 'border-l-[6px] border-black pl-3' : 'border-l-3 border-black/30 pl-3'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black uppercase text-xs">{i === 0 ? 'Recommended' : 'Alternative'}</span>
                    <span className="font-mono text-xs font-bold bg-[#b7a0ff] border-2 border-black px-2 py-1">
                      {r.deliverableType}
                    </span>
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
