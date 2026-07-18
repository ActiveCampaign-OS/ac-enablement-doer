'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RequestStatus, DeliverableType } from '@prisma/client'

const DECLINE_CATEGORIES = [
  { value: 'wrong_deliverable', label: 'Wrong deliverable for the need' },
  { value: 'not_training_problem', label: 'Not actually a training problem' },
  { value: 'duplicate_request', label: 'Duplicate of an existing request' },
  { value: 'too_big_for_agent', label: 'Too big — needs the human team' },
  { value: 'no_longer_needed', label: 'No longer needed' },
  { value: 'other', label: 'Other' },
]

interface Viewer {
  email: string | null
  isOperator: boolean
}

export function RequestActions({
  requestId,
  status,
  effectiveType,
  handoff,
  requesterEmail,
}: {
  requestId: string
  status: RequestStatus
  effectiveType: DeliverableType | null
  handoff: boolean
  requesterEmail: string
}) {
  const router = useRouter()
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [declining, setDeclining] = useState(false)
  const [declineCategory, setDeclineCategory] = useState(DECLINE_CATEGORIES[0].value)
  const [declineReason, setDeclineReason] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((me) => setViewer({ email: me.email, isOperator: me.isOperator }))
      .catch(() => setViewer({ email: null, isOperator: false }))
  }, [])

  async function act(action: string) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/requests/${requestId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? `Failed (${res.status})`)
    }
    setBusy(false)
    router.refresh()
  }

  async function decline() {
    if (!declineReason.trim()) {
      setError('A reason is required to decline.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decline: { category: declineCategory, reason: declineReason } }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? `Failed (${res.status})`)
    } else {
      setDeclining(false)
    }
    setBusy(false)
    router.refresh()
  }

  const isRequester = viewer?.email === requesterEmail
  const isOperator = viewer?.isOperator ?? false

  const buttons: Array<{ label: string; action: string; show: boolean; primary?: boolean }> = [
    {
      label: handoff ? `Confirm ${effectiveType ?? ''} (human build)` : `Confirm ${effectiveType ?? ''}`,
      action: 'CONFIRMED',
      show: status === 'RECOMMENDED' && (isRequester || isOperator),
      primary: true,
    },
    { label: 'Approve handoff', action: 'APPROVED', show: status === 'HANDOFF_REQUIRED' && isOperator, primary: true },
    { label: 'Approve draft', action: 'APPROVED', show: status === 'DRAFT_READY' && isOperator, primary: true },
    { label: 'Mark delivered', action: 'DELIVERED', show: status === 'APPROVED' && isOperator, primary: true },
    { label: 'Archive', action: 'ARCHIVED', show: ['DELIVERED', 'CONFIRMED', 'DECLINED'].includes(status) },
    { label: 'Reopen', action: 'SUBMITTED', show: ['DECLINED', 'ARCHIVED'].includes(status) },
  ]
  const visible = buttons.filter((b) => b.show)
  const canDecline = ['SUBMITTED', 'NEEDS_INFO', 'RECOMMENDED', 'HANDOFF_REQUIRED'].includes(status)

  if (!visible.length && !canDecline) return null

  return (
    <section className="nb-panel p-5 space-y-4">
      <h2 className="nb-section-title">Next move</h2>
      <div className="flex items-center gap-2 flex-wrap">
        {visible.map((b) => (
          <button
            key={b.action}
            onClick={() => act(b.action)}
            disabled={busy}
            className={
              b.primary
                ? 'nb-button nb-button-primary'
                : 'nb-button nb-button-secondary'
            }
          >
            {b.label}
          </button>
        ))}
        {canDecline && (
          <button
            onClick={() => setDeclining(!declining)}
            disabled={busy}
            className="nb-button nb-button-danger"
          >
            Decline…
          </button>
        )}
      </div>

      {declining && (
        <div className="border-3 border-black bg-[#fff1f1] p-4 space-y-3">
          <select
            value={declineCategory}
            onChange={(e) => setDeclineCategory(e.target.value)}
            className="nb-input"
          >
            {DECLINE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={2}
            placeholder="Why? This feeds back into future assessments."
            className="nb-input"
          />
          <button
            onClick={decline}
            disabled={busy || !declineReason.trim()}
            className="nb-button nb-button-danger"
          >
            Decline request
          </button>
        </div>
      )}

      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{error}</p>}
    </section>
  )
}
