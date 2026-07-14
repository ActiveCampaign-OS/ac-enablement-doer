import { NextRequest, NextResponse } from 'next/server'
import { checkConfluenceAccess, getConfluencePageBody, confluencePlainText } from '@/lib/confluence'

// Confluence readiness. `?pageId=…` additionally proves the get-page-body
// endpoint + parser against a real page (use the Spine page id before
// enabling the refresh cron). Hooks-bypass webhook — curl-able without SSO.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const access = await checkConfluenceAccess()
  const granted = access.confluenceVendor?.found && access.confluenceVendor.appAccess === 'active'

  const out: Record<string, unknown> = {
    ok: !!granted,
    access,
    spinePageIdConfigured: !!process.env.SPINE_CONFLUENCE_PAGE_ID,
  }

  const pageId = new URL(req.url).searchParams.get('pageId') || process.env.SPINE_CONFLUENCE_PAGE_ID
  if (granted && pageId) {
    try {
      const payload = await getConfluencePageBody(pageId)
      const text = confluencePlainText(payload)
      out.pageProbe = { pageId, ok: text.length > 0, chars: text.length, excerpt: text.slice(0, 200) }
    } catch (err) {
      out.pageProbe = {
        pageId,
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }
    }
  }
  return NextResponse.json(out)
}
