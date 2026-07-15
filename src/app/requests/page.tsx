import Link from 'next/link'
import { headers } from 'next/headers'
import { getPrisma } from '@/lib/prisma'
import { StatusChip } from './StatusChip'
import type { RequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; status?: string }>
}) {
  const params = await searchParams
  const h = await headers()
  const email = (
    h.get('x-auth-request-email') ||
    h.get('cf-access-authenticated-user-email') ||
    ''
  )
    .trim()
    .toLowerCase()

  const all = params.all === '1'
  const status = params.status as RequestStatus | undefined

  const prisma = getPrisma()
  const requests = await prisma.trainingRequest.findMany({
    where: {
      ...(all ? {} : email ? { requesterEmail: email } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { lastActivityAt: 'desc' },
    take: 200,
    include: { _count: { select: { messages: true, assessments: true } } },
  })

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="flex items-end justify-between gap-5 mb-8">
        <div>
          <span className="nb-kicker">{all ? 'Operator view' : 'Request tracker'}</span>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-[-0.08em] leading-none">
            {all ? 'All requests' : 'My requests'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={all ? '/requests' : '/requests?all=1'}
            className="nb-button nb-button-secondary"
          >
            {all ? 'Mine only' : 'View all'}
          </Link>
          <Link
            href="/requests/new"
            className="nb-button nb-button-primary"
          >
            + New
          </Link>
        </div>
      </div>

      {requests.length === 0 ? (
        <p className="nb-panel-soft p-5 font-semibold">No requests yet.</p>
      ) : (
        <ul className="nb-list">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="nb-row-link items-center justify-between gap-4 px-4 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold">{r.title}</div>
                  <div className="text-xs font-semibold text-[#625d53] mt-1">
                    {r.requesterEmail}
                    {r.recommendedType ? ` · ${r.confirmedType ?? r.recommendedType}` : ''}
                    {` · ${r._count.messages} msgs · v${r._count.assessments}`}
                  </div>
                </div>
                <StatusChip status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
