'use client'

import { useState } from 'react'

export default function SlackConnectionTestPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function sendTest() {
    setStatus('sending')
    setMessage(null)
    try {
      const response = await fetch('/api/diagnostics/slack-test', { method: 'POST' })
      const body = (await response.json()) as { error?: string; message?: string }
      if (!response.ok) throw new Error(body.error ?? 'Slack connection test failed.')
      setStatus('sent')
      setMessage(body.message ?? 'Slack connection test posted.')
    } catch (error) {
      setStatus('failed')
      setMessage(error instanceof Error ? error.message : 'Slack connection test failed.')
    }
  }

  return (
    <main className="nb-page-shell mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <section className="nb-panel space-y-5 p-6">
        <p className="nb-eyebrow">Operator diagnostic</p>
        <h1 className="nb-page-title">Slack connection test</h1>
        <p className="text-sm leading-6 text-[var(--ink-muted)]">
          Post one clearly labeled test message to the configured Enablement Do-er Slack channel.
          No request, Jira issue, learner, asset, or record is created.
        </p>
        <button className="nb-button nb-button-primary" disabled={status === 'sending'} onClick={sendTest}>
          {status === 'sending' ? 'Posting test…' : 'Post Slack connection test'}
        </button>
        {message && (
          <p className={status === 'sent' ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-red-700'}>
            {message}
          </p>
        )}
      </section>
    </main>
  )
}
