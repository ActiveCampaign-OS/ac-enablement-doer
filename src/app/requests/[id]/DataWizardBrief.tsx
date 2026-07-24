'use client'

import { useEffect, useState } from 'react'

const DATA_WIZARD_URL = 'https://app.glean.com/chat/agents/e3ee5b6de16c4c15884252308080a84f?qe=https%3A%2F%2Factivecampaign-be.glean.com'

interface Viewer {
  isOperator: boolean
}

export function DataWizardBrief({ requestId, prompt }: { requestId: string; prompt: string }) {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [copied, setCopied] = useState(false)
  const [recorded, setRecorded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me')
      .then((response) => response.json())
      .then((me) => setViewer({ isOperator: me.isOperator === true }))
      .catch(() => setViewer({ isOperator: false }))
  }, [])

  async function copyBrief() {
    setError(null)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setError('Copy failed. Select the brief and copy it manually.')
    }
  }

  async function recordHandoff() {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/requests/${requestId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DATA_WIZARD_BRIEF_PREPARED' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload.error ?? `Failed (${response.status})`)
    } else {
      setRecorded(true)
    }
    setBusy(false)
  }

  if (!viewer?.isOperator) return null

  return (
    <section className="nb-panel p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <span className="nb-kicker">Optional evidence step</span>
          <h2 className="nb-section-title">Data Wizard research brief</h2>
          <p className="text-sm font-semibold text-[#625d53]">
            Operator-controlled BI research through StratOps Data Wizard. This app does not send a query or access Snowflake directly.
          </p>
        </div>
        <span className="nb-status nb-status-draft">REVIEW FIRST</span>
      </div>

      <div className="border-3 border-black bg-[#e5f3ff] p-4 text-sm font-semibold space-y-2">
        <p>Only the support context below is included. Requester identity, stakeholder names, links, thread messages, and the pixel doodle stay out.</p>
        <p>Review it before sending. Prefer approved BI dashboards and read-only analysis; add sensitive identifiers only when justified and permitted.</p>
      </div>

      <textarea
        readOnly
        value={prompt}
        rows={16}
        aria-label="Data Wizard research brief"
        className="nb-input font-mono text-xs leading-5"
      />

      <div className="flex gap-2 flex-wrap">
        <button onClick={copyBrief} className="nb-button nb-button-primary">
          {copied ? 'Brief copied' : 'Copy research brief'}
        </button>
        <a href={DATA_WIZARD_URL} target="_blank" rel="noreferrer" className="nb-button nb-button-purple">
          Open StratOps Data Wizard
        </a>
        <button onClick={recordHandoff} disabled={busy || recorded} className="nb-button nb-button-secondary">
          {recorded ? 'Handoff recorded' : 'Record research handoff'}
        </button>
      </div>

      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{error}</p>}
    </section>
  )
}
