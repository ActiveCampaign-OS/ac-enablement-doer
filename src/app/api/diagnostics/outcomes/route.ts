import { NextRequest, NextResponse } from 'next/server'
import { logOutcome } from '@/lib/outcomes'

// Outcomes readiness: env review, plus `?emit=1` to fire a real test emit of
// training-request-assessed (metadata.diagnostic=true) and report exactly what
// came back — including Cloudflare-intercept detection. Hooks-bypass webhook.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const env = {
    OUTCOMES_URL: process.env.OUTCOMES_URL ?? '(unset — falls back to in-cluster URL)',
    SPARK_API_KEY_set: !!process.env.SPARK_API_KEY,
    OUTCOMES_API_KEY_set: !!process.env.OUTCOMES_API_KEY,
    publicHostWarning: (process.env.OUTCOMES_URL ?? '').includes('ac-spark.com/api')
      ? 'OUTCOMES_URL points at the public host — Cloudflare Access will silently eat posts!'
      : null,
  }

  if (new URL(req.url).searchParams.get('emit') === '1') {
    const result = await logOutcome('training-request-assessed', {
      diagnostic: true,
      note: 'emitted by /api/diagnostics/outcomes?emit=1',
    })
    return NextResponse.json({ ok: result.ok, env, emit: result })
  }
  return NextResponse.json({ ok: env.SPARK_API_KEY_set || env.OUTCOMES_API_KEY_set, env, hint: 'add ?emit=1 to fire a test outcome' })
}
