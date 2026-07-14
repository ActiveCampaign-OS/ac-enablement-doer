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
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Operator queue</h1>
      <p className="text-sm text-charcoal-400 mb-6">
        Everything open, grouped by what needs an operator. Overrides and approvals are recorded
        with your SSO identity.
      </p>

      {GROUPS.map((g) => {
        const rows = requests.filter((r) => g.statuses.includes(r.status))
        if (!rows.length) return null
        return (
          <section key={g.title} className="mb-8">
            <h2 className="text-sm font-semibold text-charcoal-300 uppercase tracking-wide mb-1">
              {g.title} <span className="text-charcoal-500">({rows.length})</span>
            </h2>
            {g.note && <p className="text-xs text-charcoal-500 mb-2">{g.note}</p>}
            <ul className="divide-y divide-charcoal-800 border border-charcoal-800 rounded-3">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/requests/${r.id}`} className="min-w-0 hover:underline">
                      <span className="truncate font-medium">{r.title}</span>
                    </Link>
                    <StatusChip status={r.status} />
                  </div>
                  <div className="text-xs text-charcoal-400 mt-1">
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

      {requests.length === 0 && <p className="text-charcoal-400">Queue is empty. 🎉</p>}
    </div>
  )
}
