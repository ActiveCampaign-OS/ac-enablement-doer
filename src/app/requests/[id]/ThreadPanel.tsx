'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RequestStatus } from '@prisma/client'

interface Message {
  id: string
  role: string
  author: string
  body: string
  createdAt: string
}

export function ThreadPanel({
  requestId,
  status,
  messages,
}: {
  requestId: string
  status: RequestStatus
  messages: Message[]
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [reassessing, setReassessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/requests/${requestId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (res.ok) {
      const out = await res.json()
      setBody('')
      if (out.reassessing) {
        setReassessing(true)
        // Give the re-assessment a moment, then refresh; the status chip
        // flips to ASSESSING immediately on refresh either way.
        setTimeout(() => {
          setReassessing(false)
          router.refresh()
        }, 4000)
      }
    } else {
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? `Failed (${res.status})`)
    }
    setBusy(false)
    router.refresh()
  }

  const roleStyle: Record<string, string> = {
    AGENT: 'nb-message-agent',
    STAKEHOLDER: 'nb-message-stakeholder',
    OPERATOR: 'nb-message-operator',
  }

  return (
    <section className="nb-panel p-5 sm:p-6">
      <h2 className="nb-section-title mb-4">Conversation</h2>
      <div className="space-y-3">
        {messages.length === 0 && (
          <p className="border-3 border-dashed border-black p-4 text-sm font-semibold">No messages yet — the agent posts here when it has questions or a recommendation.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`border-3 border-black px-4 py-3 ${roleStyle[m.role] ?? roleStyle.STAKEHOLDER}`}>
            <div className="text-xs font-black uppercase tracking-wide mb-2">
              {m.role === 'AGENT' ? '🤖 agent' : m.author} ·{' '}
              {m.createdAt.slice(0, 16).replace('T', ' ')}
            </div>
            <div className="text-sm font-semibold whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
        {(reassessing || status === 'ASSESSING') && (
          <div className="border-3 border-black bg-[#ffe45c] px-4 py-3 text-sm font-black animate-pulse">
            🤖 re-assessing with your reply…
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={
            status === 'NEEDS_INFO'
              ? 'Answer the agent’s questions — it will re-assess automatically.'
              : 'Add context or push back on the recommendation…'
          }
          className="nb-input flex-1"
        />
        <button
          onClick={send}
          disabled={busy || !body.trim()}
          className="nb-button nb-button-primary self-end"
        >
          Send
        </button>
      </div>
      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold mt-3">{error}</p>}
    </section>
  )
}
