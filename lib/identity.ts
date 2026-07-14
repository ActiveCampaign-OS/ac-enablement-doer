import type { NextRequest } from 'next/server'

// Identity from the Spark gateway. Every human request is SSO-gated
// (Google login restricted to @activecampaign.com); the gateway sets the
// signed-in user's email on each request. `x-auth-request-email` is the
// current header; `cf-access-authenticated-user-email` is the legacy alias
// older apps read. Machine callers (cron, hooks-bypass webhooks) carry
// neither and keep their own auth (CRON_SECRET / webhook secrets).
export function getActorEmail(req: NextRequest): string | null {
  const e =
    req.headers.get('x-auth-request-email') ||
    req.headers.get('cf-access-authenticated-user-email')
  return e ? e.trim().toLowerCase() : null
}
