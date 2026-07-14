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
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {all ? 'All requests' : 'My requests'}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={all ? '/requests' : '/requests?all=1'}
            className="text-charcoal-300 hover:text-midnight-white"
          >
            {all ? '→ mine only' : '→ view all'}
          </Link>
          <Link
            href="/requests/new"
            className="bg-ac-blue-700 hover:bg-ac-blue-600 text-midnight-white px-3 py-1.5 rounded-2 font-medium"
          >
            + New
          </Link>
        </div>
      </div>

      {requests.length === 0 ? (
        <p className="text-charcoal-400">No requests yet.</p>
      ) : (
        <ul className="divide-y divide-charcoal-800 border border-charcoal-800 rounded-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-charcoal-900 transition-colors"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-xs text-charcoal-400 mt-0.5">
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
