'use client'

import { useEffect, useState } from 'react'

const JIRA_BASE_URL = 'https://activecampaign.atlassian.net'

interface JiraWorkItemState {
  jiraIssueKey: string | null
  jiraIssueUrl: string | null
  jiraSyncStatus: string
  jiraSyncError: string | null
}

function isCreating(status: string): boolean {
  return status === 'CREATING'
}

function issueUrl(state: JiraWorkItemState): string | null {
  if (!state.jiraIssueKey) return null
  return state.jiraIssueUrl ?? `${JIRA_BASE_URL}/browse/${state.jiraIssueKey}`
}

export function JiraWorkItem({
  requestId,
  requestStatus,
  initialState,
}: {
  requestId: string
  requestStatus: string
  initialState: JiraWorkItemState
}) {
  const [state, setState] = useState(initialState)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    setState(initialState)
  }, [initialState.jiraIssueKey, initialState.jiraIssueUrl, initialState.jiraSyncStatus, initialState.jiraSyncError])

  useEffect(() => {
    if (!isCreating(state.jiraSyncStatus)) return

    let active = true
    const refresh = async () => {
      try {
        const response = await fetch(`/api/requests/${requestId}`, { cache: 'no-store' })
        if (!response.ok || !active) return
        const request = (await response.json()) as JiraWorkItemState
        setState({
          jiraIssueKey: request.jiraIssueKey,
          jiraIssueUrl: request.jiraIssueUrl,
          jiraSyncStatus: request.jiraSyncStatus,
          jiraSyncError: request.jiraSyncError,
        })
      } catch {
        return
      }
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(interval)
  }, [requestId, state.jiraSyncStatus])

  const url = issueUrl(state)
  if (url && state.jiraIssueKey) {
    return (
      <p className="nb-jira-work-item nb-jira-work-item-created" role="status">
        <span>✓ Jira created</span>
        <a href={url} target="_blank" rel="noreferrer">
          Open {state.jiraIssueKey} ↗
        </a>
      </p>
    )
  }

  if (isCreating(state.jiraSyncStatus)) {
    return (
      <p className="nb-jira-work-item nb-jira-work-item-creating" role="status">
        Creating Jira work item…
      </p>
    )
  }

  if (state.jiraSyncStatus === 'QUEUED') {
    const nextStep = requestStatus === 'HANDOFF_REQUIRED'
      ? 'the handoff is being created'
      : 'the agent has a completed draft ready for review'
    return (
      <p className="nb-jira-work-item nb-jira-work-item-creating" role="status">
        Jira work item queued — it will be created when {nextStep}.
      </p>
    )
  }

  async function retry() {
    setRetrying(true)
    try {
      const response = await fetch(`/api/requests/${requestId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RETRY_JIRA_SYNC' }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setState((current) => ({ ...current, jiraSyncError: body.error ?? `Retry failed (${response.status})` }))
        return
      }
      setState((current) => ({ ...current, jiraSyncStatus: 'CREATING', jiraSyncError: null }))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="nb-jira-work-item nb-jira-work-item-error" role="alert">
      <p>Jira creation needs attention: {state.jiraSyncError ?? state.jiraSyncStatus.replaceAll('_', ' ')}</p>
      <button type="button" className="nb-button" onClick={() => void retry()} disabled={retrying}>
        {retrying ? 'Retrying Jira…' : 'Retry Jira'}
      </button>
    </div>
  )
}
