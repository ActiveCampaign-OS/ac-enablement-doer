import { NextResponse } from 'next/server'
import { checkGleanAccess } from '@/lib/glean'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const glean = await checkGleanAccess()
  return NextResponse.json({
    ok: glean.vendorFound && glean.appAccess === 'active' && glean.mcpAvailable && !glean.error,
    glean,
    next: glean.error
      ? 'Resolve the reported ACOS-Data vendor or MCP access state before adding a user-authenticated Glean action.'
      : 'Glean MCP is available through ACOS-Data. Keep Data Wizard queries operator-initiated until a user-authenticated agent-run contract is approved.',
  })
}
