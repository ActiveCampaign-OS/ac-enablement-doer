import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { getConfluencePageBody, confluencePlainText, checkConfluenceAccess } from '@/lib/confluence'
import { frameworkHash } from '@/lib/spine/framework'
import { notifySlack } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/cron/refresh-spine — weekly, optional. "Enrich, don't depend":
// no-ops cleanly until SPINE_CONFLUENCE_PAGE_ID is set AND the confluence
// vendor's appAccess is granted. On change (hash mismatch) it inserts a new
// FrameworkDoc row, which loadFramework() then prefers over the repo copy.
export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pageId = process.env.SPINE_CONFLUENCE_PAGE_ID
  if (!pageId) {
    return NextResponse.json({ skipped: 'SPINE_CONFLUENCE_PAGE_ID not set' })
  }

  const access = await checkConfluenceAccess()
  const granted = access.confluenceVendor?.found && access.confluenceVendor.appAccess === 'active'
  if (!granted) {
    return NextResponse.json({
      skipped: `confluence appAccess not active (${access.confluenceVendor?.appAccess ?? access.vendorsError ?? 'vendor not found'})`,
    })
  }

  after(async () => {
    try {
      const prisma = getPrisma()
      const payload = await getConfluencePageBody(pageId)
      const content = confluencePlainText(payload)
      if (!content || content.length < 2000) {
        console.error(`[refresh-spine] page ${pageId} came back too small (${content?.length ?? 0} chars) — keeping current copy`)
        return
      }
      const hash = frameworkHash(content)
      const existing = await prisma.frameworkDoc.findUnique({ where: { contentHash: hash } })
      if (existing) {
        console.log(`[refresh-spine] unchanged (${hash})`)
        return
      }
      await prisma.frameworkDoc.create({
        data: { source: 'CONFLUENCE', version: hash, contentHash: hash, content },
      })
      console.log(`[refresh-spine] new framework version ${hash} (${content.length} chars)`)
      await notifySlack([
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🧠 *Spine framework refreshed from Confluence* — new version \`${hash}\` (${content.length} chars). Future assessments use it automatically.`,
          },
        },
      ])
    } catch (err) {
      console.error(`[refresh-spine] failed: ${err instanceof Error ? err.message : err}`)
    }
  })

  return NextResponse.json({ ok: true, queued: true })
}
