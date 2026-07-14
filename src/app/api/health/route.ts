import { NextResponse } from 'next/server'

// Kubernetes readiness probe target. Keep this as cheap as
// possible — no DB query, no ACOS call, no Prisma. If this route
// is ever slow the rollout will get stuck and the deploy fails
// with "Health check timed out after 300s".
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    build: process.env.BUILD_ID || 'dev',
    node: process.version,
    ts: new Date().toISOString(),
  })
}
