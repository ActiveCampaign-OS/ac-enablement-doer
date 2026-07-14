import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getActorEmail } from './identity'

// Two allowlists, both comma-separated emails set in Spark secrets, both
// opt-in by design (empty = not enforced, everyone passes):
//
//   WRITE_ALLOWLIST    — who may perform any write at all
//   OPERATOR_ALLOWLIST — who is an enablement operator (sees the queue,
//                        overrides recommendations, approves handoffs)
//
// Machine callers (cron, hooks-bypass webhooks) carry NO SSO email and
// keep their own auth (CRON_SECRET / webhook secrets), so they are never
// blocked by this layer — it governs logged-in humans only.

export { getActorEmail }

function parseList(env: string | undefined): Set<string> {
  return new Set(
    (env || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
}

const writeAllowlist = () => parseList(process.env.WRITE_ALLOWLIST)
const operatorAllowlist = () => parseList(process.env.OPERATOR_ALLOWLIST)

/** Whether a given SSO email may write. Used by /api/me for the UI. */
export function canWriteEmail(email: string | null): { canWrite: boolean; enforced: boolean } {
  const list = writeAllowlist()
  const enforced = list.size > 0
  if (!enforced) return { canWrite: true, enforced }
  return { canWrite: !!email && list.has(email), enforced }
}

/** Whether a given SSO email is an enablement operator. */
export function isOperatorEmail(email: string | null): { isOperator: boolean; enforced: boolean } {
  const list = operatorAllowlist()
  const enforced = list.size > 0
  if (!enforced) return { isOperator: true, enforced } // unconfigured → everyone operates
  return { isOperator: !!email && list.has(email), enforced }
}

export interface WriteCheck {
  ok: boolean
  email: string | null
  enforced: boolean
}

/**
 * Gate a write request. Returns ok=false only for a logged-in human who
 * isn't on the allowlist. Machine requests (no SSO email) and the
 * unconfigured state both pass through.
 */
export function checkWrite(req: NextRequest): WriteCheck {
  const email = getActorEmail(req)
  const list = writeAllowlist()
  const enforced = list.size > 0
  if (!enforced) return { ok: true, email, enforced }
  if (!email) return { ok: true, email, enforced } // machine/webhook caller
  return { ok: list.has(email), email, enforced }
}

/** Gate an operator-only request (same machine-caller pass-through). */
export function checkOperator(req: NextRequest): WriteCheck {
  const email = getActorEmail(req)
  const list = operatorAllowlist()
  const enforced = list.size > 0
  if (!enforced) return { ok: true, email, enforced }
  if (!email) return { ok: true, email, enforced }
  return { ok: list.has(email), email, enforced }
}

/** Standard 403 for a read-only user attempting a write. */
export function writeForbidden(email: string | null): NextResponse {
  return NextResponse.json(
    {
      error:
        'Read-only access — you are not on the write allowlist. Ask an admin to add you to WRITE_ALLOWLIST.',
      email,
    },
    { status: 403 }
  )
}

/** Standard 403 for a non-operator attempting an operator action. */
export function operatorForbidden(email: string | null): NextResponse {
  return NextResponse.json(
    {
      error:
        'Operator access required — ask an admin to add you to OPERATOR_ALLOWLIST.',
      email,
    },
    { status: 403 }
  )
}
