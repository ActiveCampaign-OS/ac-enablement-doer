import Link from 'next/link'
import { headers } from 'next/headers'
import { getPrisma } from '@/lib/prisma'
import { StatusChip } from './requests/StatusChip'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const h = await headers()
  const email = (
    h.get('x-auth-request-email') ||
    h.get('cf-access-authenticated-user-email') ||
    ''
  )
    .trim()
    .toLowerCase()

  const prisma = getPrisma()
  const mine = email
    ? await prisma.trainingRequest.findMany({
        where: { requesterEmail: email, status: { notIn: ['ARCHIVED'] } },
        orderBy: { lastActivityAt: 'desc' },
        take: 8,
      })
    : []

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-10">
      <section className="text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Enablement Do-er</h1>
        <p className="text-charcoal-300 max-w-xl mx-auto">
          Submit a one-off training request. The agent assesses it against the{' '}
          <span className="text-midnight-white font-medium">Design to Impact Spine</span>, recommends
          the right deliverable, and — once you confirm — builds it or routes it to a human builder.
        </p>
        <Link
          href="/requests/new"
          className="inline-block bg-ac-blue-700 hover:bg-ac-blue-600 text-midnight-white px-5 py-2.5 rounded-2 font-medium transition-colors"
        >
          + New training request
        </Link>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-300 uppercase tracking-wide mb-3">
          My open requests
        </h2>
        {mine.length === 0 ? (
          <p className="text-charcoal-400 text-sm">
            {email ? 'No open requests. Submit one above.' : 'Sign-in header not present (local dev?).'}
          </p>
        ) : (
          <ul className="divide-y divide-charcoal-800 border border-charcoal-800 rounded-3">
            {mine.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-charcoal-900 transition-colors"
                >
                  <span className="truncate">{r.title}</span>
                  <StatusChip status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
