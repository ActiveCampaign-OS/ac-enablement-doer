'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PixelDoodlePad } from './PixelDoodlePad'
import type { PixelDoodle } from '@/lib/pixel-doodle'

export default function NewRequestPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pixelDoodle, setPixelDoodle] = useState<PixelDoodle | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const payload = {
      title: fd.get('title'),
      description: fd.get('description'),
      requestType: fd.get('requestType'),
      businessImpact: fd.get('businessImpact'),
      successMeasures: fd.get('successMeasures'),
      desiredBehavior: fd.get('desiredBehavior'),
      audience: fd.get('audience'),
      urgency: fd.get('urgency'),
      dueDate: fd.get('dueDate') || null,
      stakeholders: fd.get('stakeholders'),
      sourceMaterials: fd.get('sourceMaterials'),
      accountability: fd.get('accountability'),
      pixelDoodle,
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
        <h1 className="text-4xl font-black uppercase tracking-[-0.08em] leading-none">What support do you need?</h1>
        <p className="max-w-xl text-sm font-semibold leading-6 text-[#5f594f]">
          Start with the business need, not a pre-selected solution. We&apos;ll diagnose whether the best
          next step is self-serve guidance, a coaching asset, Enablement partnership, or a non-training fix.
        </p>
      </div>

      <form onSubmit={onSubmit} className="nb-panel p-5 sm:p-7 space-y-5">
        <div>
          <label className={label} htmlFor="title">
            Brief request title <span className="text-red-400">*</span>
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
            What is happening?{' '}
            <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Describe the initiative, product, process, or challenge. You do not need to prescribe a training or resource solution.
          </p>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            className={input}
            placeholder="What changed, where is the gap, and who or what is affected?"
          />
        </div>
        <div>
          <label className={label} htmlFor="requestType">
            Where should we start? <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            This is a starting point, not a solution choice. Select help me diagnose if you are unsure.
          </p>
          <select id="requestType" name="requestType" required defaultValue="HELP_ME_DIAGNOSE" className={input}>
            <option value="HELP_ME_DIAGNOSE">Help me diagnose the right support</option>
            <option value="SELF_SERVE_RESOURCE">Find or share a self-serve resource</option>
            <option value="COACHING_SUPPORT">Support managers with coaching</option>
            <option value="ENABLEMENT_PARTNERSHIP">Explore an Enablement partnership</option>
            <option value="OTHER">Something else</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="businessImpact">
            What business impact are you trying to achieve?{' '}
            <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Describe the outcome this should affect: customer experience, revenue, adoption, quality, risk, efficiency, or another result.
          </p>
          <textarea
            id="businessImpact"
            name="businessImpact"
            required
            rows={4}
            className={input}
            placeholder="e.g. Improve customer reactivation outcomes and reduce avoidable handoffs."
          />
        </div>
        <div>
          <label className={label} htmlFor="successMeasures">
            How will you know this worked? <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Include the signal, baseline or target, and timeframe when known. Qualitative evidence is welcome when a KPI is not available.
          </p>
          <textarea
            id="successMeasures"
            name="successMeasures"
            required
            rows={3}
            className={input}
            placeholder="e.g. 80% adoption by Q4, fewer escalation errors, and manager confidence in weekly check-ins."
          />
        </div>
        <div>
          <label className={label} htmlFor="desiredBehavior">
            What should people do differently? <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Describe the observable behavior, when it should happen, and what good looks like. If the issue is not behavior, say so.
          </p>
          <textarea
            id="desiredBehavior"
            name="desiredBehavior"
            required
            rows={4}
            className={input}
            placeholder="e.g. AEs diagnose reactivation fit in discovery and use the approved talk track before escalating."
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
            What source materials are available?{' '}
            <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Include decks, process docs, guides, recordings, existing self-serve resources, or in-progress materials and their readiness dates.
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
            How will the desired behavior be reinforced? <span className="text-red-400">*</span>
          </label>
          <p className="mb-2 text-xs font-semibold text-[#625d53]">
            Explain who owns follow-through and how managers or leaders will reinforce success through coaching, reporting, dashboards, or follow-ups.
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

        <PixelDoodlePad onChange={setPixelDoodle} />

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
