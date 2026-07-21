import { NextResponse } from 'next/server'
import { checkGleanAccess } from '@/lib/glean'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const glean = await checkGleanAccess()
  return NextResponse.json({
    ok: glean.configured && !glean.error,
    glean,
    next: glean.error
      ? 'Correct the configured Glean MCP token before agent discovery can run.'
      : glean.agentDiscoveryTools.length
        ? 'Inspect the listed agent-discovery tool schema before enabling a Glean agent run.'
        : 'Glean is connected, but no agent-discovery tool is exposed by this MCP connection.',
  })
}
