'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeckSlide {
  number: number
  title: string
  takeaway: string
  body: string[]
  speakerNotes: string
  visualDirection: string
}

interface AssetBuildView {
  id: string
  deliverableType: string
  status: 'QUEUED' | 'RUNNING' | 'DRAFT_READY' | 'APPROVED' | 'DELIVERED' | 'FAILED'
  revision: number
  attempt: number
  draftTitle: string | null
  draftSummary: string | null
  draftContent: string | null
  draftData: unknown
  error: string | null
  artifacts: Array<{ id: string; fileName: string; kind: string }>
}

const LABELS: Record<AssetBuildView['status'], string> = {
  QUEUED: 'QUEUED',
  RUNNING: 'BUILDING',
  DRAFT_READY: 'DRAFT READY',
  APPROVED: 'APPROVED',
  DELIVERED: 'DELIVERED',
  FAILED: 'NEEDS RETRY',
}

function slidesFrom(value: unknown): DeckSlide[] {
  if (!value || typeof value !== 'object') return []
  const slides = (value as { slides?: unknown }).slides
  if (!Array.isArray(slides)) return []
  return slides.filter(
    (slide): slide is DeckSlide =>
      !!slide &&
      typeof slide === 'object' &&
      typeof (slide as DeckSlide).title === 'string' &&
      Array.isArray((slide as DeckSlide).body)
  )
}

export function AssetBuildPanel({ requestId, build }: { requestId: string; build: AssetBuildView }) {
  const router = useRouter()
  const [isOperator, setIsOperator] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(build.draftTitle ?? '')
  const [draftContent, setDraftContent] = useState(build.draftContent ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slides = useMemo(() => slidesFrom(build.draftData), [build.draftData])

  useEffect(() => {
    fetch('/api/me')
      .then((response) => response.json())
      .then((viewer) => setIsOperator(viewer.isOperator === true))
      .catch(() => setIsOperator(false))
  }, [])

  useEffect(() => {
    if (!['QUEUED', 'RUNNING'].includes(build.status)) return
    const interval = window.setInterval(() => router.refresh(), 4_000)
    return () => window.clearInterval(interval)
  }, [build.status, router])

  async function requestAction(action: 'RETRY_ASSET_BUILD' | 'REGENERATE_ASSET_BUILD') {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/requests/${requestId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, buildId: build.id }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload.error ?? `Failed (${response.status})`)
    }
    setBusy(false)
    router.refresh()
  }

  async function saveDraft() {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/asset-builds/${build.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftTitle, draftContent }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload.error ?? `Failed (${response.status})`)
    } else {
      setEditing(false)
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <section className="nb-panel p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <span className="nb-kicker">Asset build · revision {build.revision}</span>
          <h2 className="nb-section-title">{build.deliverableType.replace(/_/g, ' ')}</h2>
          <p className="text-sm font-semibold text-[#625d53]">
            {build.status === 'RUNNING' ? 'The asset builder is collecting approved context and drafting now.' : null}
            {build.status === 'QUEUED' ? 'The asset builder has this next.' : null}
            {build.status === 'DRAFT_READY' ? 'Review the draft, adjust it if needed, then approve delivery.' : null}
            {build.status === 'FAILED' ? 'The source inputs are intact. An operator can retry the build.' : null}
          </p>
        </div>
        <span className="nb-status nb-status-draft">{LABELS[build.status]}</span>
      </div>

      {build.error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{build.error}</p>}

      {build.draftSummary && <p className="border-y-3 border-black py-3 text-sm font-bold">{build.draftSummary}</p>}

      {build.deliverableType === 'DECK' && slides.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#625d53]">
            Presentation storyboard · editable PPTX export is pending the Spark presentation renderer
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {slides.map((slide) => (
              <details key={slide.number} className="border-3 border-black bg-[#fffdf5] p-3" open={slide.number === 1}>
                <summary className="cursor-pointer font-black uppercase text-sm">
                  {slide.number}. {slide.title}
                </summary>
                <p className="mt-2 text-sm font-bold">{slide.takeaway}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold">
                  {slide.body.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="mt-3 text-xs font-semibold text-[#625d53]">Facilitator: {slide.speakerNotes}</p>
                <p className="mt-2 text-xs font-semibold text-[#625d53]">Visual: {slide.visualDirection}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {build.draftContent && !editing && (
        <div className="border-3 border-black bg-[#fffdf5] p-4">
          <h3 className="font-black uppercase text-sm mb-3">{build.draftTitle}</h3>
          <pre className="whitespace-pre-wrap font-sans text-sm font-semibold leading-6">{build.draftContent}</pre>
        </div>
      )}

      {editing && (
        <div className="space-y-3 border-3 border-black bg-[#e7f7a2] p-4">
          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} className="nb-input" aria-label="Draft title" />
          <textarea value={draftContent} onChange={(event) => setDraftContent(event.target.value)} rows={18} className="nb-input font-mono text-xs" aria-label="Draft content" />
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy || !draftTitle.trim() || !draftContent.trim()} onClick={saveDraft} className="nb-button nb-button-primary">Save draft</button>
            <button disabled={busy} onClick={() => setEditing(false)} className="nb-button nb-button-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {build.artifacts.map((artifact) => (
          <a key={artifact.id} href={`/api/asset-builds/${artifact.id}/download`} className="nb-button nb-button-secondary">
            Download {artifact.fileName}
          </a>
        ))}
        {isOperator && build.status === 'DRAFT_READY' && !editing && (
          <button disabled={busy} onClick={() => setEditing(true)} className="nb-button nb-button-purple">Edit draft</button>
        )}
        {isOperator && build.status === 'DRAFT_READY' && (
          <button disabled={busy} onClick={() => requestAction('REGENERATE_ASSET_BUILD')} className="nb-button nb-button-secondary">Regenerate</button>
        )}
        {isOperator && build.status === 'FAILED' && (
          <button disabled={busy} onClick={() => requestAction('RETRY_ASSET_BUILD')} className="nb-button nb-button-primary">Retry build</button>
        )}
      </div>
      {error && <p className="border-3 border-black bg-[#ff9696] px-3 py-2 text-sm font-bold">{error}</p>}
    </section>
  )
}
