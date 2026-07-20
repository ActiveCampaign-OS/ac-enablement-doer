import type { Assessment, AssetArtifact, AssetBuild, RequestMessage, TrainingRequest } from '@prisma/client'
import { AcosError, callAcos, listVendors } from './acos-client'
import { getPrisma } from './prisma'

const JIRA_BASE_URL = 'https://activecampaign.atlassian.net'
const DEFAULT_PROJECT_KEY = 'GEP'
const DEFAULT_ISSUE_TYPE = 'Global Enablement Programming Request'
const MAX_DESCRIPTION_LENGTH = 7500

interface JiraCreateIssueResponse {
  id?: string
  key?: string
  issueKey?: string
  issue_key?: string
  self?: string
  url?: string
  issue?: {
    id?: string
    key?: string
    issueKey?: string
    self?: string
  }
}

interface JiraProjectResponse {
  lead?: { accountId?: string }
  project?: { lead?: { accountId?: string } }
}

type JiraAssignee = { accountId: string } | null

type JiraRequest = TrainingRequest & {
  assessments: Assessment[]
  messages: RequestMessage[]
  assetBuilds: Array<AssetBuild & { artifacts: AssetArtifact[] }>
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ac-enablement-doer.ac-spark.com').replace(/\/$/, '')
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function compactJson(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return ''
  return truncate(JSON.stringify(value, null, 2), maxLength)
}

function appendSection(sections: string[], label: string, value: string | null | undefined): void {
  const text = value?.trim()
  if (text) sections.push(`${label}\n${text}`)
}

function descriptionText(request: JiraRequest): string {
  const latestAssessment = request.assessments[0] ?? null
  const latestBuild = request.assetBuilds[0] ?? null
  const primaryArtifact = latestBuild?.artifacts.find((artifact) => artifact.kind === 'DOCX')
    ?? latestBuild?.artifacts.find((artifact) => artifact.kind === 'DECK_STORYBOARD')
    ?? latestBuild?.artifacts[0]
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
  ]

  const sections = ['Enablement Do-er request']
  appendSection(
    sections,
    'Record',
    [
      `Request status: ${request.status}`,
      request.confirmedType ? `Confirmed deliverable: ${request.confirmedType}` : null,
      `Enablement Do-er record: ${appUrl()}/requests/${request.id}`,
    ]
      .filter(Boolean)
      .join('\n')
  )
  if (latestBuild) {
    appendSection(
      sections,
      'Delivery handoff',
      [
        `Build status: ${latestBuild.status} · revision ${latestBuild.revision}`,
        latestBuild.draftTitle ? `Asset title: ${latestBuild.draftTitle}` : null,
        latestBuild.draftSummary ?? null,
        primaryArtifact ? `Download ${primaryArtifact.fileName}: ${appUrl()}/api/asset-builds/${primaryArtifact.id}/download` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
    appendSection(sections, 'Draft excerpt', latestBuild.draftContent ? truncate(latestBuild.draftContent, 1_500) : null)
  }

  const intakeSections: string[] = []
  for (const [label, value] of entries) {
    const trimmedValue = value?.trim()
    if (trimmedValue) intakeSections.push(`${label}\n${trimmedValue}`)
  }
  appendSection(sections, 'Intake', intakeSections.join('\n\n'))

  if (latestAssessment) {
    appendSection(
      sections,
      'Assessment',
      [
        latestAssessment.currentStage ? `Current stage: ${latestAssessment.currentStage}` : null,
        `Sufficient scope: ${latestAssessment.sufficient ? 'yes' : 'no'}`,
        latestAssessment.workingNotes ? `Working notes:\n${compactJson(latestAssessment.workingNotes, 1_400)}` : null,
        latestAssessment.recommendations ? `Recommendations:\n${compactJson(latestAssessment.recommendations, 1_400)}` : null,
        latestAssessment.spineSteps ? `Spine steps:\n${compactJson(latestAssessment.spineSteps, 1_400)}` : null,
      ]
        .filter(Boolean)
        .join('\n\n')
    )
  }

  if (request.messages.length) {
    appendSection(
      sections,
      'Stakeholder and agent conversation',
      request.messages
        .map((message) => {
          const timestamp = message.createdAt.toISOString().slice(0, 16).replace('T', ' ')
          return `[${timestamp}] ${message.role} · ${message.author}\n${message.body}`
        })
        .join('\n\n')
    )
  }

  let description = sections[0]
  for (const section of sections.slice(1)) {
    const remaining = MAX_DESCRIPTION_LENGTH - description.length - 2
    if (remaining <= 0) break
    description += `\n\n${truncate(section, remaining)}`
  }
  return description
}

function issueKeyFrom(response: JiraCreateIssueResponse): string | null {
  const issueKey = response.key ?? response.issueKey ?? response.issue_key ?? response.issue?.key ?? response.issue?.issueKey
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

function projectLeadAccountId(project: JiraProjectResponse): string | null {
  const accountId = project.lead?.accountId ?? project.project?.lead?.accountId
  return accountId?.trim() || null
}

async function defaultAssignee(projectKey: string): Promise<JiraAssignee> {
  const configuredAssignee = process.env.JIRA_ASSIGNEE_ACCOUNT_ID?.trim()
  if (configuredAssignee) return { accountId: configuredAssignee }

  const { data: project } = await callAcos<JiraProjectResponse>('jira', 'get-project', { projectIdOrKey: projectKey })
  const accountId = projectLeadAccountId(project)
  if (!accountId) throw new Error(`Jira project ${projectKey} has no project lead account ID for default assignment`)
  return { accountId }
}

function createIssueParams(request: JiraRequest, projectKey: string, issueType: string, assignee: JiraAssignee) {
  return {
    projectKey,
    summary: truncate(request.title, 250),
    issueType,
    description: descriptionText(request),
    fields: {
      assignee,
      labels: ['enablement-doer'],
    },
  }
}

export interface JiraAccessCheck {
  projectKey: string
  issueType: string
  acosEnv: { url: boolean; appId: boolean; apiKey: boolean }
  jiraVendor?: { found: boolean; appAccess?: string }
  vendorsError?: string
}

export async function checkJiraAccess(): Promise<JiraAccessCheck> {
  const out: JiraAccessCheck = {
    projectKey: process.env.JIRA_PROJECT_KEY?.trim() || DEFAULT_PROJECT_KEY,
    issueType: process.env.JIRA_ISSUE_TYPE?.trim() || DEFAULT_ISSUE_TYPE,
    acosEnv: {
      url: !!process.env.ACOS_DATA_URL,
      appId: !!process.env.ACOS_APP_ID,
      apiKey: !!process.env.ACOS_API_KEY,
    },
  }
  try {
    const vendors = await listVendors()
    const jira = vendors.find((vendor) => {
      const record = vendor as Record<string, unknown>
      return record.slug === 'jira' || record.vendor === 'jira' || record.name === 'jira'
    }) as Record<string, unknown> | undefined
    out.jiraVendor = jira ? { found: true, appAccess: typeof jira.appAccess === 'string' ? jira.appAccess : undefined } : { found: false }
  } catch (error) {
    out.vendorsError = error instanceof Error ? error.message : String(error)
  }
  return out
}

export async function createJiraIssueForRequest(requestId: string): Promise<void> {
  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({
    where: { id: requestId },
    include: {
      assessments: { orderBy: { version: 'desc' }, take: 1 },
      messages: { orderBy: { createdAt: 'asc' } },
      assetBuilds: {
        orderBy: { revision: 'desc' },
        take: 1,
        include: { artifacts: { orderBy: { createdAt: 'asc' } } },
      },
    },
  })
  if (!request || request.jiraIssueKey) return

  const claim = await prisma.trainingRequest.updateMany({
    where: { id: requestId, jiraIssueKey: null, jiraSyncStatus: 'QUEUED' },
    data: { jiraSyncStatus: 'CREATING', jiraSyncError: null },
  })
  if (claim.count !== 1) return

  try {
    const projectKey = process.env.JIRA_PROJECT_KEY?.trim() || DEFAULT_PROJECT_KEY
    const issueType = process.env.JIRA_ISSUE_TYPE?.trim() || DEFAULT_ISSUE_TYPE
    const assignee = await defaultAssignee(projectKey)
    const { data } = await callAcos<JiraCreateIssueResponse>(
      'jira',
      'create-issue',
      createIssueParams(request, projectKey, issueType, assignee)
    )
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
