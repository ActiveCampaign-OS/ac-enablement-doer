'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewRequestPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [links, setLinks] = useState<string[]>([''])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const payload = {
      title: fd.get('title'),
      description: fd.get('description'),
      audience: fd.get('audience') || null,
      businessGoal: fd.get('businessGoal') || null,
      urgency: fd.get('urgency') || null,
      dueDate: fd.get('dueDate') || null,
      contentLinks: links.map((l) => l.trim()).filter(Boolean),
    }
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/requests/${created.id}`)
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? `Request failed (${res.status})`)
      setSubmitting(false)
    }
  }

  const input = 'nb-input'
  const label = 'nb-label'

  return (
    <div className="max-w-2xl mx-auto py-4">
      <div className="mb-7 space-y-3">
        <span className="nb-kicker">Intake desk</span>
        <h1 className="text-4xl font-black uppercase tracking-[-0.08em] leading-none">New training request</h1>
        <p className="max-w-xl text-sm font-semibold leading-6 text-[#5f594f]">
          Give the agent the change you want to see. More context up front means fewer follow-up
          questions later.
        </p>
      </div>

      <form onSubmit={onSubmit} className="nb-panel p-5 sm:p-7 space-y-5">
        <div>
          <label className={label} htmlFor="title">
            Title <span className="text-red-400">*</span>
          </label>
          <input id="title" name="title" required maxLength={200} className={input} placeholder="e.g. Reactivation Agent — AE talk track" />
        </div>
        <div>
          <label className={label} htmlFor="description">
            What needs training, and why now? <span className="text-red-400">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            className={input}
            placeholder="Describe the change you want to see. What are people doing today, and what should they be doing instead?"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="audience">Audience</label>
            <input id="audience" name="audience" className={input} placeholder="e.g. AEs, CS managers" />
          </div>
          <div>
            <label className={label} htmlFor="urgency">Urgency</label>
            <input id="urgency" name="urgency" className={input} placeholder="e.g. before the June launch" />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="businessGoal">Business goal it rolls up to</label>
          <input
            id="businessGoal"
            name="businessGoal"
            className={input}
            placeholder="e.g. lift reactivation-sourced pipeline; cut handling time on X"
          />
        </div>
        <div>
          <label className={label} htmlFor="dueDate">Due date</label>
          <input id="dueDate" name="dueDate" type="date" className={input} />
        </div>
        <div>
          <label className={label}>Source material links</label>
          {links.map((l, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                value={l}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
                className={input}
                placeholder="Confluence / Google Doc / recording URL"
              />
              {i === links.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setLinks([...links, ''])}
                  className="nb-button nb-button-secondary shrink-0 px-3"
                  aria-label="Add link"
                >
                  +
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                  className="nb-button nb-button-danger shrink-0 px-3"
                  aria-label="Remove link"
                >
                  −
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="nb-button nb-button-primary"
        >
          {submitting ? 'Submitting…' : 'Submit for assessment'}
        </button>
      </form>
    </div>
  )
}
