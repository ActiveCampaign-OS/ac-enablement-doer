'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { PixelDoodlePad } from './PixelDoodlePad'
import type { PixelDoodle } from '@/lib/pixel-doodle'
import {
  emptyIntakeValues,
  INTAKE_FALLBACK_QUESTIONS,
  INTAKE_FIELD_KEYS,
  INTAKE_FIELD_LABELS,
  intakeIsComplete,
  nextMissingIntakeField,
  type IntakeField,
  type IntakeMode,
  type IntakeValues,
  type RequestType,
} from '@/lib/intake'

type ChatMessage = { role: 'agent' | 'manager'; body: string }

interface InterviewResponse {
  values: IntakeValues
  assistantMessage: string
  nextField: IntakeField | null
  nextQuestion: string | null
  readyForReview: boolean
}

const REQUEST_TYPES: Array<{ value: RequestType; label: string }> = [
  { value: 'HELP_ME_DIAGNOSE', label: 'Help me diagnose the right support' },
  { value: 'SELF_SERVE_RESOURCE', label: 'Find or share a self-serve resource' },
  { value: 'COACHING_SUPPORT', label: 'Support managers with coaching' },
  { value: 'ENABLEMENT_PARTNERSHIP', label: 'Explore an Enablement partnership' },
  { value: 'OTHER', label: 'Something else' },
]

function TextAreaField({
  field,
  label,
  helper,
  placeholder,
  rows,
  value,
  onChange,
}: {
  field: IntakeField
  label: string
  helper: string
  placeholder: string
  rows: number
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="nb-label" htmlFor={field}>
        {label} <span className="text-red-400">*</span>
      </label>
      <p className="mb-2 text-xs font-semibold text-[#625d53]">{helper}</p>
      <textarea
        id={field}
        name={field}
        required
        rows={rows}
        className="nb-input"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function StructuredIntake({
  values,
  onFieldChange,
  onRequestTypeChange,
  onSubmit,
  submitting,
  error,
  onDoodleChange,
}: {
  values: IntakeValues
  onFieldChange: (field: IntakeField | 'dueDate', value: string) => void
  onRequestTypeChange: (value: RequestType) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitting: boolean
  error: string | null
  onDoodleChange: (doodle: PixelDoodle | null) => void
}) {
  return (
    <form onSubmit={onSubmit} className="nb-panel p-5 sm:p-7 space-y-5">
      <div>
        <label className="nb-label" htmlFor="title">
          Brief request title <span className="text-red-400">*</span>
        </label>
        <p className="mb-2 text-xs font-semibold text-[#625d53]">Brief descriptive title — less than 250 characters.</p>
        <input
          id="title"
          name="title"
          required
          maxLength={250}
          className="nb-input"
          placeholder="e.g. Reactivation Agent — AE talk track"
          value={values.title}
          onChange={(event) => onFieldChange('title', event.target.value)}
        />
      </div>
      <TextAreaField
        field="description"
        label="What is happening?"
        helper="Describe the initiative, product, process, or challenge. You do not need to prescribe a training or resource solution."
        rows={5}
        placeholder="What changed, where is the gap, and who or what is affected?"
        value={values.description}
        onChange={(value) => onFieldChange('description', value)}
      />
      <div>
        <label className="nb-label" htmlFor="requestType">
          Where should we start? <span className="text-red-400">*</span>
        </label>
        <p className="mb-2 text-xs font-semibold text-[#625d53]">
          This is a starting point, not a solution choice. Select help me diagnose if you are unsure.
        </p>
        <select
          id="requestType"
          name="requestType"
          required
          className="nb-input"
          value={values.requestType}
          onChange={(event) => onRequestTypeChange(event.target.value as RequestType)}
        >
          {REQUEST_TYPES.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <TextAreaField
        field="businessImpact"
        label="What business impact are you trying to achieve?"
        helper="Describe the outcome this should affect: customer experience, revenue, adoption, quality, risk, efficiency, or another result."
        rows={4}
        placeholder="e.g. Improve customer reactivation outcomes and reduce avoidable handoffs."
        value={values.businessImpact}
        onChange={(value) => onFieldChange('businessImpact', value)}
      />
      <TextAreaField
        field="successMeasures"
        label="How will you know this worked?"
        helper="Include the signal, baseline or target, and timeframe when known. Qualitative evidence is welcome when a KPI is not available."
        rows={3}
        placeholder="e.g. 80% adoption by Q4, fewer escalation errors, and manager confidence in weekly check-ins."
        value={values.successMeasures}
        onChange={(value) => onFieldChange('successMeasures', value)}
      />
      <TextAreaField
        field="desiredBehavior"
        label="What should people do differently?"
        helper="Describe the observable behavior, when it should happen, and what good looks like. If the issue is not behavior, say so."
        rows={4}
        placeholder="e.g. AEs diagnose reactivation fit in discovery and use the approved talk track before escalating."
        value={values.desiredBehavior}
        onChange={(value) => onFieldChange('desiredBehavior', value)}
      />
      <TextAreaField
        field="audience"
        label="Who is the required audience?"
        helper="Specify the team(s) or role(s) and whether completion is required or recommended."
        rows={3}
        placeholder="e.g. Customer Success CSMs; completion is required before the launch."
        value={values.audience}
        onChange={(value) => onFieldChange('audience', value)}
      />
      <TextAreaField
        field="urgency"
        label="What is your desired timeline?"
        helper="Note the target launch, hard deadlines, and dependencies."
        rows={3}
        placeholder="e.g. Launch by September 15; dependent on final product documentation by August 22."
        value={values.urgency}
        onChange={(value) => onFieldChange('urgency', value)}
      />
      <div>
        <label className="nb-label" htmlFor="dueDate">Hard deadline, if known</label>
        <input
          id="dueDate"
          name="dueDate"
          type="date"
          className="nb-input"
          value={values.dueDate}
          onChange={(event) => onFieldChange('dueDate', event.target.value)}
        />
      </div>
      <TextAreaField
        field="stakeholders"
        label="Who are the key stakeholders?"
        helper="List advocates, approvers, reviewers, and subject matter experts with their roles."
        rows={4}
        placeholder="Advocate: … | Approver: … | Reviewer: … | Subject matter expert: …"
        value={values.stakeholders}
        onChange={(value) => onFieldChange('stakeholders', value)}
      />
      <TextAreaField
        field="sourceMaterials"
        label="What source materials are available?"
        helper="Include decks, process docs, guides, recordings, existing self-serve resources, or in-progress materials and their readiness dates."
        rows={5}
        placeholder="Paste links or describe the materials and when any in-progress content will be ready."
        value={values.sourceMaterials}
        onChange={(value) => onFieldChange('sourceMaterials', value)}
      />
      <TextAreaField
        field="accountability"
        label="How will the desired behavior be reinforced?"
        helper="Explain who owns follow-through and how managers or leaders will reinforce success through coaching, reporting, dashboards, or follow-ups."
        rows={4}
        placeholder="e.g. Managers review adoption dashboards weekly and coach missed behaviors in 1:1s."
        value={values.accountability}
        onChange={(value) => onFieldChange('accountability', value)}
      />

      <PixelDoodlePad onChange={onDoodleChange} />

      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{error}</p>}

      <button type="submit" disabled={submitting} className="nb-button nb-button-primary">
        {submitting ? 'Submitting…' : 'Submit for assessment'}
      </button>
    </form>
  )
}

function GuidedIntake({
  values,
  onValuesChange,
  onSubmit,
  onEditInForm,
  onDoodleChange,
  submitting,
  error,
  onError,
}: {
  values: IntakeValues
  onValuesChange: (values: IntakeValues) => void
  onSubmit: () => void
  onEditInForm: () => void
  onDoodleChange: (doodle: PixelDoodle | null) => void
  submitting: boolean
  error: string | null
  onError: (error: string | null) => void
}) {
  const [currentField, setCurrentField] = useState<IntakeField | null>(() => nextMissingIntakeField(values))
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const firstField = nextMissingIntakeField(values)
    return [
      {
        role: 'agent',
        body: firstField
          ? `I’ll help turn the situation into a clear support request. We will start with the business need, not a training solution.\n\n${INTAKE_FALLBACK_QUESTIONS[firstField]}`
          : 'Your request already has the details needed for a review. Check the summary below before submitting.',
      },
    ]
  })
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)
  const complete = intakeIsComplete(values)

  async function sendAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentField || !answer.trim()) return
    setSending(true)
    onError(null)
    const managerAnswer = answer.trim()
    setAnswer('')
    try {
      const response = await fetch('/api/intake/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, currentField, answer: managerAnswer }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? `Interview failed (${response.status})`)
      const result = body as InterviewResponse
      onValuesChange(result.values)
      setCurrentField(result.nextField)
      const nextTurn = [result.assistantMessage, result.nextQuestion].filter(Boolean).join('\n\n')
      setMessages((currentMessages) => [
        ...currentMessages,
        { role: 'manager', body: managerAnswer },
        { role: 'agent', body: nextTurn || 'Your request is ready for review.' },
      ])
    } catch (caught) {
      setAnswer(managerAnswer)
      onError(caught instanceof Error ? caught.message : 'The interview could not continue. Try again or use the structured form.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="nb-panel p-5 sm:p-7 space-y-5" aria-labelledby="guided-intake-title">
      <div className="space-y-2">
        <span className="nb-kicker">Guided interview</span>
        <h2 id="guided-intake-title" className="text-2xl font-black uppercase tracking-[-0.06em] leading-none">
          Talk it through
        </h2>
        <p className="text-sm font-semibold leading-6 text-[#5f594f]">
          One focused question at a time. You can say you are unsure, and you can edit every answer before submitting.
        </p>
      </div>

      <div className="space-y-3" role="log" aria-live="polite" aria-label="Guided intake conversation">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`border-3 border-black p-4 text-sm font-semibold whitespace-pre-wrap ${
              message.role === 'agent' ? 'bg-[#7dd3fc]' : 'bg-[#fffdf6] ml-6'
            }`}
          >
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#5f594f]">
              {message.role === 'agent' ? 'Enablement Do-er' : 'You'}
            </p>
            {message.body}
          </div>
        ))}
      </div>

      {!complete && currentField && (
        <form onSubmit={sendAnswer} className="space-y-3">
          <label className="nb-label" htmlFor="guided-answer">
            Your response
          </label>
          <textarea
            id="guided-answer"
            rows={5}
            className="nb-input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Share what you know. It is okay to say what is still unknown."
            disabled={sending}
          />
          <button className="nb-button nb-button-primary" disabled={sending || !answer.trim()}>
            {sending ? 'Thinking…' : 'Continue'}
          </button>
        </form>
      )}

      {complete && (
        <section className="nb-panel-soft p-4 space-y-4" aria-labelledby="intake-review-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="nb-kicker">Ready to review</span>
              <h3 id="intake-review-title" className="mt-3 text-xl font-black uppercase tracking-[-0.06em]">
                Here&apos;s what I heard
              </h3>
            </div>
            <button type="button" className="nb-button nb-button-secondary" onClick={onEditInForm}>
              Edit answers
            </button>
          </div>
          <dl className="space-y-3">
            {INTAKE_FIELD_KEYS.map((field) => (
              <div key={field} className="border-l-3 border-black pl-3">
                <dt className="text-[10px] font-black uppercase tracking-[0.1em] text-[#5f594f]">
                  {INTAKE_FIELD_LABELS[field]}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm font-semibold">{values[field]}</dd>
              </div>
            ))}
          </dl>
          <PixelDoodlePad onChange={onDoodleChange} />
          <button type="button" className="nb-button nb-button-primary" disabled={submitting} onClick={onSubmit}>
            {submitting ? 'Submitting…' : 'Submit for assessment'}
          </button>
        </section>
      )}

      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{error}</p>}
      <p className="text-xs font-semibold text-[#625d53]">
        Prefer a traditional form? Switch modes above — your answers stay with this request.
      </p>
    </section>
  )
}

export default function NewRequestPage() {
  const router = useRouter()
  const [mode, setMode] = useState<IntakeMode>('GUIDED_CHAT')
  const [values, setValues] = useState<IntakeValues>(() => emptyIntakeValues())
  const [pixelDoodle, setPixelDoodle] = useState<PixelDoodle | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: IntakeField | 'dueDate', value: string) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }))
  }

  async function submitRequest(intakeMode: IntakeMode) {
    if (!intakeIsComplete(values)) {
      setError('Please complete the required request details before submitting.')
      return
    }
    setSubmitting(true)
    setError(null)
    const response = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, intakeMode, pixelDoodle }),
    })
    if (response.ok) {
      const created = await response.json()
      router.push(`/requests/${created.id}`)
      return
    }
    const body = await response.json().catch(() => ({}))
    setError(body.error ?? `Request failed (${response.status})`)
    setSubmitting(false)
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-5">
      <header className="mb-2 space-y-3">
        <span className="nb-kicker">Intake desk</span>
        <h1 className="text-4xl font-black uppercase tracking-[-0.08em] leading-none">What support do you need?</h1>
        <p className="max-w-xl text-sm font-semibold leading-6 text-[#5f594f]">
          Start with the business need, not a pre-selected solution. We&apos;ll diagnose whether the best next step is
          self-serve guidance, a coaching asset, Enablement partnership, or a non-training fix.
        </p>
      </header>

      <section className="nb-panel p-3 sm:p-4 space-y-3" aria-labelledby="intake-mode-title">
        <div>
          <h2 id="intake-mode-title" className="nb-section-title">Choose your way</h2>
          <p className="mt-1 text-xs font-semibold text-[#625d53]">Both paths create the same request and keep your answers if you switch.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Request intake mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'GUIDED_CHAT'}
            className={`border-3 border-black p-4 text-left shadow-[4px_4px_0_#171717] ${mode === 'GUIDED_CHAT' ? 'bg-[#b7f27d]' : 'bg-[#fffdf6]'}`}
            onClick={() => setMode('GUIDED_CHAT')}
          >
            <span className="text-xs font-black uppercase tracking-[0.1em]">Recommended</span>
            <span className="mt-1 block text-lg font-black uppercase tracking-[-0.05em]">Guided conversation</span>
            <span className="mt-1 block text-xs font-semibold">Talk it through one question at a time.</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'FORM'}
            className={`border-3 border-black p-4 text-left shadow-[4px_4px_0_#171717] ${mode === 'FORM' ? 'bg-[#b7a0ff]' : 'bg-[#fffdf6]'}`}
            onClick={() => setMode('FORM')}
          >
            <span className="text-xs font-black uppercase tracking-[0.1em]">Direct entry</span>
            <span className="mt-1 block text-lg font-black uppercase tracking-[-0.05em]">Structured form</span>
            <span className="mt-1 block text-xs font-semibold">See every question and answer at your pace.</span>
          </button>
        </div>
      </section>

      {mode === 'FORM' ? (
        <StructuredIntake
          values={values}
          onFieldChange={updateField}
          onRequestTypeChange={(requestType) => setValues((currentValues) => ({ ...currentValues, requestType }))}
          onSubmit={(event) => {
            event.preventDefault()
            void submitRequest('FORM')
          }}
          submitting={submitting}
          error={error}
          onDoodleChange={setPixelDoodle}
        />
      ) : (
        <GuidedIntake
          values={values}
          onValuesChange={setValues}
          onSubmit={() => void submitRequest('GUIDED_CHAT')}
          onEditInForm={() => setMode('FORM')}
          onDoodleChange={setPixelDoodle}
          submitting={submitting}
          error={error}
          onError={setError}
        />
      )}
    </div>
  )
}
