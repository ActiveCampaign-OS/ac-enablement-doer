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

  const input =
    'w-full bg-charcoal-900 border border-charcoal-700 rounded-2 px-3 py-2 text-sm text-midnight-white placeholder-charcoal-500 focus:outline-none focus:border-ac-blue-600'
  const label = 'block text-sm font-medium text-charcoal-200 mb-1'

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">New training request</h1>
      <p className="text-sm text-charcoal-400 mb-6">
        The agent will assess this against the Design to Impact Spine. The more you can say about
        the business goal and who it&apos;s for, the fewer questions it will need to ask.
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
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
        <div className="grid grid-cols-2 gap-4">
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
                  className="shrink-0 px-3 rounded-2 border border-charcoal-700 text-charcoal-300 hover:text-midnight-white"
                  aria-label="Add link"
                >
                  +
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setLinks(links.filter((_, j) => j !== i))}
                  className="shrink-0 px-3 rounded-2 border border-charcoal-700 text-charcoal-300 hover:text-red-300"
                  aria-label="Remove link"
                >
                  −
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="bg-ac-blue-700 hover:bg-ac-blue-600 disabled:opacity-50 text-midnight-white px-5 py-2.5 rounded-2 font-medium transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit for assessment'}
        </button>
      </form>
    </div>
  )
}
