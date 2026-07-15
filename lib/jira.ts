import type { TrainingRequest } from '@prisma/client'
import { AcosError, callAcos } from './acos-client'
import { getPrisma } from './prisma'

const JIRA_BASE_URL = 'https://activecampaign.atlassian.net'
const DEFAULT_PROJECT_KEY = 'GEP'
const DEFAULT_ISSUE_TYPE = 'Global Enablement Programming Request'
const MAX_DESCRIPTION_LENGTH = 7500

interface JiraCreateIssueResponse {
  id?: string
  key?: string
  self?: string
  issue?: {
    id?: string
    key?: string
    self?: string
  }
}

type AdfNode = {
  type: string
  version?: number
  attrs?: Record<string, unknown>
  content?: AdfNode[]
  text?: string
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ac-enablement-doer.ac-spark.com').replace(/\/$/, '')
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function textNode(text: string): AdfNode {
  return { type: 'text', text }
}

function paragraph(text: string): AdfNode {
  return { type: 'paragraph', content: [textNode(truncate(text, MAX_DESCRIPTION_LENGTH))] }
}

function descriptionDocument(request: TrainingRequest): AdfNode {
  const entries: Array<[string, string | null | undefined]> = [
    ['Submitted by', request.requesterEmail],
    ['Situation, challenge, or initiative', request.description],
    ['Outcomes and success measures', request.businessGoal],
    ['Required audience', request.audience],
    ['Desired timeline', request.urgency],
    ['Hard deadline', request.dueDate?.toISOString().slice(0, 10)],
    ['Key stakeholders', request.stakeholders],
    ['Existing resources and documentation', request.sourceMaterials],
    ['Next steps and accountability', request.accountability],
    ['Resource links', request.contentLinks.join('\n')],
    ['Enablement Do-er request', `${appUrl()}/requests/${request.id}`],
  ]

  const content: AdfNode[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [textNode('Enablement Do-er request')],
    },
  ]

  for (const [label, value] of entries) {
    const trimmedValue = value?.trim()
    if (trimmedValue) content.push(paragraph(`${label}\n${trimmedValue}`))
  }

  return { type: 'doc', version: 1, content }
}

function issueKeyFrom(response: JiraCreateIssueResponse): string | null {
  const issueKey = response.key ?? response.issue?.key
  return issueKey?.trim() || null
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof AcosError) return { code: error.code, message: error.message }
  if (error instanceof Error) return { code: error.name, message: error.message }
  return { code: 'UNKNOWN_ERROR', message: String(error) }
}

function requiresApproval(code: string): boolean {
  return code === 'PENDING_APPROVAL' || code === 'AUTH_PERMISSION_DENIED'
}

export async function createJiraIssueForRequest(requestId: string): Promise<void> {
  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({ where: { id: requestId } })
  if (!request || request.jiraIssueKey) return

  const claim = await prisma.trainingRequest.updateMany({
    where: { id: requestId, jiraIssueKey: null, jiraSyncStatus: 'QUEUED' },
    data: { jiraSyncStatus: 'CREATING', jiraSyncError: null },
  })
  if (claim.count !== 1) return

  try {
    const projectKey = process.env.JIRA_PROJECT_KEY?.trim() || DEFAULT_PROJECT_KEY
    const issueType = process.env.JIRA_ISSUE_TYPE?.trim() || DEFAULT_ISSUE_TYPE
    const { data } = await callAcos<JiraCreateIssueResponse>('jira', 'create-issue', {
      fields: {
        project: { key: projectKey },
        summary: truncate(request.title, 250),
        issuetype: { name: issueType },
        description: descriptionDocument(request),
      },
    })
    const jiraIssueKey = issueKeyFrom(data)
    if (!jiraIssueKey) throw new Error('Jira create-issue returned no issue key')

    const jiraIssueUrl = `${JIRA_BASE_URL}/browse/${encodeURIComponent(jiraIssueKey)}`
    await prisma.trainingRequest.update({
      where: { id: requestId },
      data: {
        jiraIssueKey,
        jiraIssueUrl,
        jiraSyncStatus: 'CREATED',
        jiraSyncError: null,
        actions: {
          create: {
            action: 'jira_issue_created',
            actor: null,
            source: 'system',
            metadata: { jiraIssueKey, jiraIssueUrl },
          },
        },
      },
    })
  } catch (error) {
    const { code, message } = errorDetails(error)
    const jiraSyncStatus = requiresApproval(code) ? 'PENDING_APPROVAL' : 'FAILED'
    const jiraSyncError = truncate(`${code}: ${message}`, 1000)
    console.error(`[jira] ${requestId} create-issue failed: ${jiraSyncError}`)

    await prisma.trainingRequest.update({
      where: { id: requestId },
      data: {
        jiraSyncStatus,
        jiraSyncError,
        actions: {
          create: {
            action: jiraSyncStatus === 'PENDING_APPROVAL' ? 'jira_issue_pending_approval' : 'jira_issue_failed',
            actor: null,
            source: 'system',
            metadata: { code, message: truncate(message, 1000) },
          },
        },
      },
    })
  }
}
