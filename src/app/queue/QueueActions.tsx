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

  const btn = 'nb-button nb-button-secondary text-[11px] px-3 py-1'

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
            className="nb-button nb-button-primary text-[11px] px-3 py-1"
          >
            Approve handoff
          </button>
        )}
        {status === 'APPROVED' && (
          <button
            disabled={busy}
            onClick={() => call('POST', `/api/requests/${requestId}/action`, { action: 'DELIVERED' })}
            className="nb-button nb-button-primary text-[11px] px-3 py-1"
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
        <div className="border-3 border-black bg-[#f7b1e6] p-3 flex items-center gap-2 flex-wrap">
          <select
            value={overrideType}
            onChange={(e) => setOverrideType(e.target.value as DeliverableType)}
            className="nb-input w-auto text-xs"
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
            className="nb-input flex-1 min-w-48 text-xs"
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
            className="nb-button nb-button-purple text-[11px] px-3 py-1"
          >
            Apply
          </button>
        </div>
      )}

      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-xs font-bold">{error}</p>}
    </div>
  )
}
