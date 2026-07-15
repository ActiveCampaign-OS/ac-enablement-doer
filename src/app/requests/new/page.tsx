'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewRequestPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const payload = {
      title: fd.get('title'),
      description: fd.get('description'),
      audience: fd.get('audience'),
      businessGoal: fd.get('businessGoal'),
      urgency: fd.get('urgency'),
      dueDate: fd.get('dueDate') || null,
      stakeholders: fd.get('stakeholders'),
      sourceMaterials: fd.get('sourceMaterials'),
      accountability: fd.get('accountability'),
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
          Use the same information you would provide in Global Enablement Programming&apos;s Help
          Center request. More context up front means fewer follow-up questions later.
        </p>
      </div>

      <form onSubmit={onSubmit} className="nb-panel p-5 sm:p-7 space-y-5">
        <div>
          <label className={label} htmlFor="title">
            Request / Project Title <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Brief descriptive title — less than 250 characters.
          </p>
          <input
            id="title"
            name="title"
            required
            maxLength={250}
            className={input}
            placeholder="e.g. Reactivation Agent — AE talk track"
          />
        </div>
        <div>
          <label className={label} htmlFor="description">
            What situation, challenge, or initiative are you requesting enablement support for?{' '}
            <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Describe what is happening and the gap or challenge enablement will help address.
          </p>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            className={input}
            placeholder="Include the initiative, product, process, or update and the current gap."
          />
        </div>
        <div>
          <label className={label} htmlFor="businessGoal">
            What outcomes are you aiming to achieve, and how will you measure success?{' '}
            <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Include expected adoption, behavior changes, KPIs, CSAT/NPS, quality metrics, or error reduction.
          </p>
          <textarea
            id="businessGoal"
            name="businessGoal"
            required
            rows={4}
            className={input}
            placeholder="e.g. Lift adoption to 80% and reduce errors by 25% within one quarter."
          />
        </div>
        <div>
          <div>
            <label className={label} htmlFor="audience">
              Who is the required audience? <span className="text-red-400">*</span>
            </label>
            <p className="mb-2 text-xs font-semibold text-[#625d53]">
              Specify the team(s) or role(s) and whether completion is required or recommended.
            </p>
            <textarea
              id="audience"
              name="audience"
              required
              rows={3}
              className={input}
              placeholder="e.g. Customer Success CSMs; completion is required before the launch."
            />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="urgency">
            What is your desired timeline? <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Note the target launch, hard deadlines, and dependencies.
          </p>
          <textarea
            id="urgency"
            name="urgency"
            required
            rows={3}
            className={input}
            placeholder="e.g. Launch by September 15; dependent on final product documentation by August 22."
          />
        </div>
        <div>
          <label className={label} htmlFor="dueDate">Hard deadline, if known</label>
          <input id="dueDate" name="dueDate" type="date" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="stakeholders">
            Who are the key stakeholders? <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            List advocates, approvers, reviewers, and subject matter experts with their roles.
          </p>
          <textarea
            id="stakeholders"
            name="stakeholders"
            required
            rows={4}
            className={input}
            placeholder="Advocate: … | Approver: … | Reviewer: … | Subject matter expert: …"
          />
        </div>
        <div>
          <label className={label} htmlFor="sourceMaterials">
            What existing resources or documentation should be used to build this enablement?{' '}
            <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Include decks, process docs, guides, recordings, or in-progress materials and their readiness dates.
          </p>
          <textarea
            id="sourceMaterials"
            name="sourceMaterials"
            required
            rows={5}
            className={input}
            placeholder="Paste links or describe the materials and when any in-progress content will be ready."
          />
        </div>
        <div>
          <label className={label} htmlFor="accountability">
            Next steps and accountability <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Explain learner expectations and how managers or leaders will reinforce success through coaching, reporting, dashboards, or follow-ups.
          </p>
          <textarea
            id="accountability"
            name="accountability"
            required
            rows={4}
            className={input}
            placeholder="e.g. Managers review adoption dashboards weekly and coach missed behaviors in 1:1s."
          />
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
