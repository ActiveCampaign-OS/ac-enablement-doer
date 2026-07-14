'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RequestStatus, DeliverableType } from '@prisma/client'

const TYPES: DeliverableType[] = [
  'JOB_AID',
  'MANAGER_GUIDE',
  'DECK',
  'SOLIDROAD_SIM_SPEC',
  'RISE_COURSE',
  'OTHER',
]

export function QueueActions({
  requestId,
  status,
  recommendedType,
  assignedTo,
}: {
  requestId: string
  status: RequestStatus
  recommendedType: DeliverableType | null
  assignedTo: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overriding, setOverriding] = useState(false)
  const [overrideType, setOverrideType] = useState<DeliverableType>(recommendedType ?? 'JOB_AID')
  const [overrideReason, setOverrideReason] = useState('')

  async function call(method: 'PATCH' | 'POST', path: string, body: unknown) {
    setBusy(true)
    setError(null)
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? `Failed (${res.status})`)
    }
    setBusy(false)
    router.refresh()
    return res.ok
  }

  const btn =
    'text-xs border border-charcoal-700 hover:bg-charcoal-800 disabled:opacity-50 text-charcoal-200 px-2.5 py-1 rounded-2 transition-colors'

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!assignedTo && (
          <button
            disabled={busy}
            onClick={async () => {
              const me = await fetch('/api/me').then((r) => r.json())
              if (me.email) await call('PATCH', `/api/requests/${requestId}`, { assignedTo: me.email })
            }}
            className={btn}
          >
            Assign to me
          </button>
        )}
        {status === 'HANDOFF_REQUIRED' && (
          <button
            disabled={busy}
            onClick={() => call('POST', `/api/requests/${requestId}/action`, { action: 'APPROVED' })}
            className={`${btn} border-emerald-800 text-emerald-300 hover:bg-emerald-950`}
          >
            Approve handoff
          </button>
        )}
        {status === 'APPROVED' && (
          <button
            disabled={busy}
            onClick={() => call('POST', `/api/requests/${requestId}/action`, { action: 'DELIVERED' })}
            className={`${btn} border-emerald-800 text-emerald-300 hover:bg-emerald-950`}
          >
            Mark delivered
          </button>
        )}
        {['NEEDS_INFO', 'RECOMMENDED', 'HANDOFF_REQUIRED'].includes(status) && (
          <button disabled={busy} onClick={() => setOverriding(!overriding)} className={btn}>
            Override type…
          </button>
        )}
        {['SUBMITTED', 'NEEDS_INFO'].includes(status) && (
          <button
            disabled={busy}
            onClick={() => call('POST', `/api/requests/${requestId}/assess`, {})}
            className={btn}
          >
            Re-run assessment
          </button>
        )}
      </div>

      {overriding && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={overrideType}
            onChange={(e) => setOverrideType(e.target.value as DeliverableType)}
            className="text-xs bg-charcoal-900 border border-charcoal-700 rounded-2 px-2 py-1"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Why override? (feeds assessment learning)"
            className="text-xs flex-1 min-w-48 bg-charcoal-900 border border-charcoal-700 rounded-2 px-2 py-1 placeholder-charcoal-500"
          />
          <button
            disabled={busy || (overrideType !== recommendedType && !overrideReason.trim())}
            onClick={async () => {
              const ok = await call('PATCH', `/api/requests/${requestId}`, {
                confirmedType: overrideType,
                overrideReason,
              })
              if (ok) setOverriding(false)
            }}
            className={`${btn} border-ac-blue-700 text-ac-blue-300`}
          >
            Apply
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
