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
    <div className="max-w-4xl mx-auto py-4 space-y-12">
      <section className="nb-hero px-6 py-9 sm:px-10 sm:py-12">
        <div className="relative z-10 max-w-2xl space-y-5">
          <span className="nb-kicker">Turn requests into real behavior change</span>
          <h1 className="nb-heading">Enablement<br />Do-er</h1>
          <p className="max-w-xl text-base font-semibold leading-6">
            Bring the messy one-off. The agent checks it against the Design to Impact Spine,
            recommends the smallest useful deliverable, and gets it built or handed off.
          </p>
          <Link href="/requests/new" className="nb-button nb-button-primary">
            + Start a training request
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <h2 className="nb-section-title">My open requests</h2>
          <span className="text-xs font-bold uppercase tracking-wide">{mine.length} active</span>
        </div>
        {mine.length === 0 ? (
          <p className="nb-panel-soft p-5 text-sm font-semibold">
            {email ? 'No open requests. Submit one above.' : 'Sign-in header not present (local dev?).'}
          </p>
        ) : (
          <ul className="nb-list">
            {mine.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="nb-row-link items-center justify-between gap-4 px-4 py-4"
                >
                  <span className="truncate font-bold">{r.title}</span>
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
