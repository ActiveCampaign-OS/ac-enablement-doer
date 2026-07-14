import { NextResponse } from 'next/server'
import { listVendors } from '@/lib/acos-client'

// ACOS gateway readiness: env vars + the vendor list with appAccess flags
// (the gateway is authoritative — spark.json is only a request). Declared as
// a hooks-bypass webhook so it can be curl'd without SSO.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const env = {
    ACOS_DATA_URL_set: !!process.env.ACOS_DATA_URL,
    ACOS_APP_ID_set: !!process.env.ACOS_APP_ID,
    ACOS_API_KEY_set: !!process.env.ACOS_API_KEY,
  }
  if (!env.ACOS_DATA_URL_set || !env.ACOS_APP_ID_set || !env.ACOS_API_KEY_set) {
    return NextResponse.json({ ok: false, reason: 'ACOS env vars not set', env })
  }
  try {
    const vendors = await listVendors()
    const summary = (vendors as Array<Record<string, unknown>>).map((v) => ({
      slug: v.slug ?? v.vendor ?? v.name,
      appAccess: v.appAccess,
    }))
    return NextResponse.json({ ok: true, env, vendors: summary })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      env,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    })
  }
}
