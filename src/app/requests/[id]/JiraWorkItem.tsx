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
  return status === 'QUEUED' || status === 'CREATING'
}

function issueUrl(state: JiraWorkItemState): string | null {
  if (!state.jiraIssueKey) return null
  return state.jiraIssueUrl ?? `${JIRA_BASE_URL}/browse/${state.jiraIssueKey}`
}

export function JiraWorkItem({
  requestId,
  initialState,
}: {
  requestId: string
  initialState: JiraWorkItemState
}) {
  const [state, setState] = useState(initialState)

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

  return (
    <p className="nb-jira-work-item nb-jira-work-item-error" role="alert">
      Jira creation needs attention: {state.jiraSyncError ?? state.jiraSyncStatus.replaceAll('_', ' ')}
    </p>
  )
}
