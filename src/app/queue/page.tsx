import Link from 'next/link'
import { getPrisma } from '@/lib/prisma'
import { StatusChip } from '../requests/StatusChip'
import { QueueActions } from './QueueActions'
import type { RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Operator triage order — handoffs and stuck loops first.
const GROUPS: Array<{ title: string; statuses: RequestStatus[]; note?: string }> = [
  { title: 'Human build needed', statuses: ['HANDOFF_REQUIRED'], note: 'Confirmed Solidroad/Rise/other — pull the spec, build, approve.' },
  { title: 'Approved — in build', statuses: ['APPROVED'] },
  { title: 'Waiting on stakeholder', statuses: ['NEEDS_INFO', 'RECOMMENDED'] },
  { title: 'In flight', statuses: ['SUBMITTED', 'ASSESSING', 'GENERATING', 'DRAFT_READY'] },
  { title: 'Confirmed (autonomous, phase 2 builds these)', statuses: ['CONFIRMED'] },
]

export default async function QueuePage() {
  const prisma = getPrisma()
  const requests = await prisma.trainingRequest.findMany({
    where: { status: { notIn: ['ARCHIVED', 'DECLINED', 'DELIVERED'] } },
    orderBy: { lastActivityAt: 'asc' }, // stalest first within groups
    include: { assessments: { orderBy: { version: 'desc' }, take: 1 } },
  })

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="mb-8 space-y-3">
        <span className="nb-kicker">Human-in-the-loop</span>
        <h1 className="text-4xl font-black uppercase tracking-[-0.08em] leading-none">Operator queue</h1>
        <p className="max-w-2xl text-sm font-semibold leading-6 text-[#5f594f]">
          Everything open, grouped by the move that needs a human. Overrides and approvals stay
          attached to your SSO identity.
        </p>
      </div>

      {GROUPS.map((g) => {
        const rows = requests.filter((r) => g.statuses.includes(r.status))
        if (!rows.length) return null
        return (
          <section key={g.title} className="mb-9">
            <h2 className="nb-section-title mb-2">
              {g.title} <span className="text-[#625d53]">({rows.length})</span>
            </h2>
            {g.note && <p className="mb-3 text-xs font-bold text-[#625d53]">{g.note}</p>}
            <ul className="nb-list">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/requests/${r.id}`} className="min-w-0 font-bold underline decoration-2 underline-offset-2">
                      <span className="truncate">{r.title}</span>
                    </Link>
                    <StatusChip status={r.status} />
                  </div>
                  <div className="text-xs font-semibold text-[#625d53] mt-2">
                    {r.requesterEmail}
                    {r.recommendedType ? ` · rec: ${r.recommendedType}` : ''}
                    {r.confirmedType && r.confirmedType !== r.recommendedType
                      ? ` · confirmed: ${r.confirmedType}`
                      : ''}
                    {r.assignedTo ? ` · 👤 ${r.assignedTo}` : ' · unassigned'}
                    {` · idle since ${r.lastActivityAt.toISOString().slice(0, 10)}`}
                  </div>
                  <QueueActions
                    requestId={r.id}
                    status={r.status}
                    recommendedType={r.recommendedType}
                    assignedTo={r.assignedTo}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {requests.length === 0 && <p className="nb-panel-soft p-5 font-bold">Queue is empty. 🎉</p>}
    </div>
  )
}
