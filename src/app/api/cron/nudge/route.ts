import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { notifySlack, requestBlocks } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000 // ~3 business days approximated as 3 days (cron only runs weekdays)
const RENUDGE_GUARD_MS = 48 * 60 * 60 * 1000

// POST /api/cron/nudge — weekday sweep for requests stuck waiting on a
// stakeholder. Verifies X-Cron-Secret, returns fast, nudges in after().
export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prisma = getPrisma()
  const now = Date.now()
  const stale = await prisma.trainingRequest.findMany({
    where: {
      status: { in: ['NEEDS_INFO', 'RECOMMENDED'] },
      lastActivityAt: { lt: new Date(now - STALE_AFTER_MS) },
      OR: [{ lastNudgedAt: null }, { lastNudgedAt: { lt: new Date(now - RENUDGE_GUARD_MS) } }],
    },
    take: 20,
  })

  after(async () => {
    for (const r of stale) {
      const waitingOn = r.status === 'NEEDS_INFO' ? 'answers to the agent’s questions' : 'a confirm/decline on the recommendation'
      await notifySlack(
        requestBlocks(
          'Stale request nudge',
          r,
          `Waiting on ${r.requesterEmail} for ${waitingOn} since ${r.lastActivityAt.toISOString().slice(0, 10)}`
        )
      )
      await getPrisma().trainingRequest.update({
        where: { id: r.id },
        data: {
          lastNudgedAt: new Date(),
          actions: { create: { action: 'nudged', actor: null, source: 'cron', metadata: { status: r.status } } },
        },
      })
    }
  })

  return NextResponse.json({ ok: true, nudging: stale.length })
}
