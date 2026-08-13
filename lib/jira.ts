import type { Assessment, AssetArtifact, AssetBuild, RequestMessage, TrainingRequest } from '@prisma/client'
import { AcosDataClient, AcosRequestError } from '@activecampaign-os/data-client'
import { AcosError, callAcos, getVendorDetails, listVendors } from './acos-client'
import { getPrisma } from './prisma'

const JIRA_BASE_URL = 'https://activecampaign.atlassian.net'
const DEFAULT_PROJECT_KEY = 'GEP'
const DEFAULT_REQUEST_TYPE = 'Global Enablement Programming Request'
const DEFAULT_REPORTER_EMAIL = 'evangilder@activecampaign.com'
const MAX_DESCRIPTION_LENGTH = 7500

interface JiraProjectResponse {
  id?: string
  key?: string
  projectTypeKey?: string
}

interface JiraVendorEndpoint {
  slug?: string
  method?: string
  description?: string
}

export interface JiraCreateContractReadiness {
  ready: boolean
  projectType: string | null
  endpointAvailability: Record<string, boolean>
  serviceDeskId: string | null
  requestTypeId: string | null
  requiredFields: string[]
  defaultReporter: { email: string; resolved: boolean; error: string | null }
  requirements: string[]
  error: string | null
}

interface JiraServiceDesk {
  id?: string | number
  projectKey?: string
  project?: { key?: string }
}

interface JiraRequestType {
  id?: string | number
  name?: string
}

interface JiraRequestField {
  fieldId?: string
  name?: string
  required?: boolean
  defaultValues?: unknown
}

interface JiraCustomerRequest {
  issueId?: string | number
  issueKey?: string
  key?: string
  _links?: { web?: string }
}

interface JsmContract {
  serviceDeskId: string
  requestTypeId: string
  fields: JiraRequestField[]
}

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
  const primaryArtifact = latestBuild?.artifacts.find((artifact) => artifact.kind === 'PPTX')
    ?? latestBuild?.artifacts.find((artifact) => artifact.kind === 'DOCX')
    ?? latestBuild?.artifacts.find((artifact) => artifact.kind === 'DECK_STORYBOARD')
    ?? latestBuild?.artifacts[0]
  const entries: Array<[string, string | null | undefined]> = [
    ['Submitted by', request.requesterEmail],
    ['Situation, challenge, or initiative', request.description],
    ['Requester starting point', request.requestType],
    ['Business impact', request.businessImpact ?? request.businessGoal],
    ['Success measures', request.successMeasures],
    ['Desired behavior change', request.desiredBehavior],
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

function contextCommentText(request: JiraRequest, heading: string, details?: string): string {
  return [
    heading,
    details?.trim() ? `Update\n${details.trim()}` : null,
    'Current Enablement Do-er record (internal)',
    descriptionText(request),
  ]
    .filter((section): section is string => !!section)
    .join('\n\n')
}

function errorDetails(error: unknown): { code: string; message: string; requestId?: string; status?: number } {
  if (error instanceof AcosError) {
    return { code: error.code, message: error.message, requestId: error.requestId, status: error.status }
  }
  if (error instanceof AcosRequestError) {
    return { code: error.code, message: error.message, requestId: error.requestId, status: error.statusCode }
  }
  if (error instanceof Error) return { code: error.name, message: error.message }
  return { code: 'UNKNOWN_ERROR', message: String(error) }
}

function requiresApproval(code: string): boolean {
  return code === 'PENDING_APPROVAL' || code === 'AUTH_PERMISSION_DENIED'
}

function vendorEndpoints(details: Record<string, unknown>): JiraVendorEndpoint[] {
  const endpoints = details.endpoints
  return Array.isArray(endpoints)
    ? endpoints.filter((endpoint): endpoint is JiraVendorEndpoint => !!endpoint && typeof endpoint === 'object')
    : []
}

function hasEndpoint(endpoints: JiraVendorEndpoint[], matcher: (endpoint: JiraVendorEndpoint) => boolean): boolean {
  return endpoints.some(matcher)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

function valuesFrom(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const dataRecord = record(data)
  return Array.isArray(dataRecord?.values) ? dataRecord.values : []
}

function fieldFrom(value: unknown): JiraRequestField | null {
  const field = record(value)
  if (!field) return null
  const fieldId = stringValue(field.fieldId)
  if (!fieldId) return null
  return {
    fieldId,
    name: stringValue(field.name) ?? undefined,
    required: field.required === true,
    defaultValues: field.defaultValues,
  }
}

function jiraClient(): AcosDataClient {
  const url = process.env.ACOS_DATA_URL
  const appId = process.env.ACOS_APP_ID
  const apiKey = process.env.ACOS_API_KEY
  if (!url || !appId || !apiKey) {
    throw new AcosError(
      'ENV_MISSING',
      'ACOS_DATA_URL / ACOS_APP_ID / ACOS_API_KEY must be set before calling Jira Service Management'
    )
  }
  return new AcosDataClient({ url, appId, apiKey, retries: 0 })
}

function serviceDeskProjectKey(value: unknown): string | null {
  const desk = value as JiraServiceDesk
  return desk.projectKey?.trim() || desk.project?.key?.trim() || null
}

async function resolveJsmContract(projectKey: string, requestTypeName: string): Promise<JsmContract> {
  const client = jiraClient()
  const { data: desksData } = await client.jira.listServiceDesks({ limit: 100 })
  const desk = valuesFrom(desksData).find((candidate) => serviceDeskProjectKey(candidate)?.toLowerCase() === projectKey.toLowerCase()) as JiraServiceDesk | undefined
  const serviceDeskId = desk ? stringValue(desk.id) : null
  if (!serviceDeskId) throw new Error(`JSM service desk for project ${projectKey} was not found`)

  const { data: requestTypesData } = await client.jira.listServiceDeskRequestTypes({ serviceDeskId, limit: 100 })
  const requestType = valuesFrom(requestTypesData).find((candidate) => {
    const type = candidate as JiraRequestType
    return type.name?.trim().toLowerCase() === requestTypeName.toLowerCase()
  }) as JiraRequestType | undefined
  const requestTypeId = requestType ? stringValue(requestType.id) : null
  if (!requestTypeId) throw new Error(`JSM request type ${requestTypeName} was not found on ${projectKey}`)

  const { data: fieldsData } = await client.jira.getServiceDeskRequestTypeFields({ serviceDeskId, requestTypeId })
  const fieldsRecord = record(fieldsData)
  const requiredFieldIds = new Set(
    valuesFrom(fieldsRecord?.requiredFields)
      .map(fieldFrom)
      .flatMap((field) => field?.fieldId ? [field.fieldId] : [])
  )
  const fields = valuesFrom(fieldsRecord?.requestTypeFields)
    .map(fieldFrom)
    .filter((field): field is JiraRequestField => field !== null)
    .map((field) => ({ ...field, required: field.required || requiredFieldIds.has(field.fieldId ?? '') }))
  if (!fields.length) throw new Error(`JSM request type ${requestTypeName} returned no portal field contract`)
  return { serviceDeskId, requestTypeId, fields }
}

function endpointAvailability(endpoints: JiraVendorEndpoint[]): Record<string, boolean> {
  const requiredSlugs = [
    'list-service-desks',
    'list-service-desk-request-types',
    'get-service-desk-request-type-fields',
    'get-customer-request',
    'create-customer-request',
    'add-customer-request-comment',
    'add-request-participant',
  ]
  return Object.fromEntries(requiredSlugs.map((slug) => [slug, hasEndpoint(endpoints, (endpoint) => endpoint.slug === slug)]))
}

export async function checkJiraCreateContractReadiness(projectKey: string, requestTypeName: string): Promise<JiraCreateContractReadiness> {
  let projectType: string | null = null
  let endpointChecks: Record<string, boolean> = {}
  const defaultReporter = { email: jiraDefaultReporterEmail(), resolved: false, error: null as string | null }
  try {
    const [{ data: project }, vendorDetails] = await Promise.all([
      callAcos<JiraProjectResponse>('jira', 'get-project', { projectIdOrKey: projectKey }),
      getVendorDetails('jira'),
    ])
    projectType = project.projectTypeKey?.trim() || null
    endpointChecks = endpointAvailability(vendorEndpoints(vendorDetails))
    const requirements = Object.entries(endpointChecks)
      .filter(([, available]) => !available)
      .map(([slug]) => `Enable the ACOS Jira ${slug} endpoint.`)
    if (projectType !== 'service_desk') requirements.push(`Confirm ${projectKey} remains a Jira Service Management project.`)
    if (requirements.length) {
      return {
        ready: false,
        projectType,
        endpointAvailability: endpointChecks,
        serviceDeskId: null,
        requestTypeId: null,
        requiredFields: [],
        defaultReporter,
        requirements,
        error: null,
      }
    }
    const contract = await resolveJsmContract(projectKey, requestTypeName)
    try {
      await resolveJiraAccountId(jiraClient(), defaultReporter.email, 'default reporter')
      defaultReporter.resolved = true
    } catch (error) {
      defaultReporter.error = error instanceof Error ? error.message : String(error)
    }
    const unmappedRequired = missingRequiredJsmFields(contract.fields, null)
    return {
      ready: unmappedRequired.length === 0 && defaultReporter.resolved,
      projectType,
      endpointAvailability: endpointChecks,
      serviceDeskId: contract.serviceDeskId,
      requestTypeId: contract.requestTypeId,
      requiredFields: contract.fields.filter((field) => field.required).map((field) => field.name ?? field.fieldId ?? 'unknown'),
      defaultReporter,
      requirements: [
        ...(unmappedRequired.length ? [`Add Enablement Do-er mappings for required JSM fields: ${unmappedRequired.join(', ')}.`] : []),
        ...(!defaultReporter.resolved ? [`Resolve the Jira account for default reporter ${defaultReporter.email}.`] : []),
      ],
      error: null,
    }
  } catch (error) {
    return {
      ready: false,
      projectType,
      endpointAvailability: endpointChecks,
      serviceDeskId: null,
      requestTypeId: null,
      requiredFields: [],
      defaultReporter,
      requirements: ['Inspect the live GEP JSM service desk, request type, and required-field contract before enabling Jira auto-create.'],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function normalizeFieldName(field: JiraRequestField): string {
  return `${field.fieldId ?? ''} ${field.name ?? ''}`.toLowerCase()
}

function fieldSource(field: JiraRequestField): keyof TrainingRequest | 'fullDescription' | 'dueDate' | null {
  const name = normalizeFieldName(field)
  if (/\bsummary\b|request.{0,8}title|project.{0,8}title/.test(name)) return 'title'
  if (/\bdescription\b|situation|challenge|initiative|\bcontext\b|details/.test(name)) return 'fullDescription'
  if (/business.{0,8}impact|business.{0,8}outcome|business.{0,8}goal/.test(name)) return 'businessImpact'
  if (/success.{0,8}measure|measure.{0,16}success|success.{0,8}metric|how.{0,8}measure|\boutcome/.test(name)) return 'successMeasures'
  if (/desired.{0,8}behavio|behavior.{0,8}change|behaviour.{0,8}change/.test(name)) return 'desiredBehavior'
  if (/audience|team.{0,8}role|who.{0,8}need/.test(name)) return 'audience'
  if (/timeline|deadline|launch.{0,8}date/.test(name)) return 'urgency'
  if (/stakeholder|approver|reviewer|subject.{0,8}matter/.test(name)) return 'stakeholders'
  if (/resource|documentation|source.{0,8}material|existing.{0,8}material/.test(name)) return 'sourceMaterials'
  if (/accountability|next.{0,8}step|reinforcement|manager.{0,8}support/.test(name)) return 'accountability'
  if (/due.{0,8}date/.test(name)) return 'dueDate'
  return null
}

function hasDefaultValue(field: JiraRequestField): boolean {
  if (Array.isArray(field.defaultValues)) return field.defaultValues.length > 0
  return field.defaultValues !== null && field.defaultValues !== undefined && field.defaultValues !== ''
}

function sourceValue(source: keyof TrainingRequest | 'fullDescription' | 'dueDate', request: JiraRequest): string | null {
  if (source === 'fullDescription') return descriptionText(request)
  if (source === 'dueDate') return request.dueDate?.toISOString().slice(0, 10) ?? null
  if (source === 'businessImpact') return request.businessImpact ?? request.businessGoal
  const value = request[source]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function missingRequiredJsmFields(fields: JiraRequestField[], request: JiraRequest | null): string[] {
  return fields
    .filter((field) => field.required)
    .filter((field) => {
      const source = fieldSource(field)
      if (!source) return !hasDefaultValue(field)
      return request ? !sourceValue(source, request) && !hasDefaultValue(field) : false
    })
    .map((field) => field.name ?? field.fieldId ?? 'unknown field')
}

function requestFieldValues(fields: JiraRequestField[], request: JiraRequest): Record<string, unknown> {
  const missingFields = missingRequiredJsmFields(fields, request)
  if (missingFields.length) {
    throw new Error(`GEP JSM request has required fields without values: ${missingFields.join(', ')}`)
  }
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const fieldId = field.fieldId
    const source = fieldSource(field)
    if (!fieldId || !source) continue
    const value = sourceValue(source, request)
    if (value) values[fieldId] = source === 'title' ? truncate(value, 250) : value
  }
  if (!Object.keys(values).length) throw new Error('GEP JSM request field mapping produced no values')
  return values
}

function jiraAccountId(data: unknown, email: string): string | null {
  const candidates = valuesFrom(data).map(record).filter((candidate): candidate is Record<string, unknown> => candidate !== null)
  const exactMatch = candidates.find((candidate) => stringValue(candidate.emailAddress)?.toLowerCase() === email.toLowerCase())
  const candidate = exactMatch ?? candidates[0]
  return candidate ? stringValue(candidate.accountId) : null
}

async function resolveJiraAccountId(client: AcosDataClient, email: string, label: string): Promise<string> {
  const { data } = await client.jira.findUsers({ query: email, maxResults: 10 })
  const accountId = jiraAccountId(data, email)
  if (!accountId) throw new Error(`Jira account lookup found no account ID for ${label} ${email}`)
  return accountId
}

async function resolveRequesterAccountId(client: AcosDataClient, email: string): Promise<string> {
  return resolveJiraAccountId(client, email, 'requester')
}

async function resolveDefaultReporterAccountId(client: AcosDataClient): Promise<string> {
  const email = jiraDefaultReporterEmail()
  return resolveJiraAccountId(client, email, 'default reporter')
}

function customerRequestKey(data: JiraCustomerRequest): string | null {
  return data.issueKey?.trim() || data.key?.trim() || null
}

function customerRequestUrl(data: JiraCustomerRequest, issueKey: string): string {
  const web = data._links?.web?.trim()
  if (web?.startsWith('http://') || web?.startsWith('https://')) return web
  if (web?.startsWith('/')) return `${JIRA_BASE_URL}${web}`
  return `${JIRA_BASE_URL}/browse/${encodeURIComponent(issueKey)}`
}

export interface JiraAccessCheck {
  projectKey: string
  requestType: string
  acosEnv: { url: boolean; appId: boolean; apiKey: boolean }
  jiraVendor?: { found: boolean; appAccess?: string }
  vendorsError?: string
}

function jiraProjectKey(): string {
  return process.env.JIRA_PROJECT_KEY?.trim() || DEFAULT_PROJECT_KEY
}

function jiraRequestType(): string {
  return process.env.JIRA_REQUEST_TYPE?.trim() || process.env.JIRA_ISSUE_TYPE?.trim() || DEFAULT_REQUEST_TYPE
}

function jiraDefaultReporterEmail(): string {
  return process.env.JIRA_DEFAULT_REPORTER_EMAIL?.trim().toLowerCase() || DEFAULT_REPORTER_EMAIL
}

function jiraCommentSyncEnabled(): boolean {
  return process.env.JIRA_COMMENT_SYNC_ENABLED?.trim().toLowerCase() !== 'false'
}

export async function checkJiraAccess(): Promise<JiraAccessCheck> {
  const out: JiraAccessCheck = {
    projectKey: jiraProjectKey(),
    requestType: jiraRequestType(),
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

export function jiraAutoCreateEnabled(): boolean {
  return process.env.JIRA_AUTOCREATE_ENABLED?.trim().toLowerCase() === 'true'
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

  if (!jiraAutoCreateEnabled()) {
    const paused = await prisma.trainingRequest.updateMany({
      where: { id: requestId, jiraIssueKey: null, jiraSyncStatus: 'QUEUED' },
      data: { jiraSyncStatus: 'PAUSED', jiraSyncError: null },
    })
    if (paused.count === 1) {
      await prisma.requestAction.create({
        data: {
          requestId,
          action: 'jira_issue_paused',
          actor: null,
          source: 'system',
          metadata: { reason: 'JIRA_AUTOCREATE_ENABLED=false' },
        },
      })
    }
    return
  }

  const claim = await prisma.trainingRequest.updateMany({
    where: { id: requestId, jiraIssueKey: null, jiraSyncStatus: 'QUEUED' },
    data: { jiraSyncStatus: 'CREATING', jiraSyncError: null },
  })
  if (claim.count !== 1) return

  const projectKey = jiraProjectKey()
  const requestType = jiraRequestType()

  try {
    const client = jiraClient()
    const defaultReporterEmail = jiraDefaultReporterEmail()
    const [contract, requesterAccountId, defaultReporterAccountId] = await Promise.all([
      resolveJsmContract(projectKey, requestType),
      resolveRequesterAccountId(client, request.requesterEmail),
      resolveDefaultReporterAccountId(client),
    ])
    const requestParticipants = requesterAccountId === defaultReporterAccountId ? [] : [requesterAccountId]
    const { data } = await client.call<JiraCustomerRequest>(
      'jira',
      'create-customer-request',
      {
        serviceDeskId: contract.serviceDeskId,
        requestTypeId: contract.requestTypeId,
        requestFieldValues: requestFieldValues(contract.fields, request),
        raiseOnBehalfOf: defaultReporterAccountId,
        ...(requestParticipants.length ? { requestParticipants } : {}),
      },
      { idempotencyKey: `enablement-doer:jsm-create:${request.id}` }
    )
    if (!data) throw new Error('JSM create-customer-request returned an empty response')
    const jiraIssueKey = customerRequestKey(data)
    if (!jiraIssueKey) throw new Error('JSM create-customer-request returned no issue key')

    const jiraIssueUrl = customerRequestUrl(data, jiraIssueKey)
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
            metadata: {
              jiraIssueKey,
              jiraIssueUrl,
              serviceDeskId: contract.serviceDeskId,
              requestTypeId: contract.requestTypeId,
              defaultReporterEmail,
              requesterParticipantIncluded: requestParticipants.length === 1,
            },
          },
        },
      },
    })

    if (jiraCommentSyncEnabled()) {
      try {
        await client.call(
          'jira',
          'add-customer-request-comment',
          {
            issueIdOrKey: jiraIssueKey,
            body: contextCommentText(request, 'Enablement Do-er initial handoff record'),
            public: false,
          },
          { idempotencyKey: `enablement-doer:jsm-initial-context:${request.id}` }
        )
        await prisma.requestAction.create({
          data: {
            requestId,
            action: 'jira_initial_context_synced',
            actor: null,
            source: 'system',
            metadata: { jiraIssueKey, public: false },
          },
        })
      } catch (contextError) {
        const details = errorDetails(contextError)
        const warning = truncate(`Jira was created, but the initial context comment needs attention: ${details.code}: ${details.message}`, 1000)
        await prisma.trainingRequest.update({
          where: { id: requestId },
          data: {
            jiraSyncError: warning,
            actions: {
              create: {
                action: 'jira_initial_context_sync_failed',
                actor: null,
                source: 'system',
                metadata: { code: details.code, message: truncate(details.message, 1000), requestId: details.requestId ?? null, status: details.status ?? null },
              },
            },
          },
        })
      }
    }

    try {
      await client.jira.getCustomerRequest({ issueIdOrKey: jiraIssueKey, expand: 'participant,status' })
      if (requesterAccountId !== defaultReporterAccountId) {
        await client.call(
          'jira',
          'add-request-participant',
          { issueIdOrKey: jiraIssueKey, accountIds: [requesterAccountId] },
          { idempotencyKey: `enablement-doer:jsm-participant:${request.id}:${requesterAccountId}` }
        )
      }
      await prisma.requestAction.createMany({
        data: [
          {
            requestId,
            action: 'jira_customer_request_verified',
            actor: null,
            source: 'system',
            metadata: { jiraIssueKey },
          },
          {
            requestId,
            action: requesterAccountId === defaultReporterAccountId ? 'jira_requester_is_default_reporter' : 'jira_requester_participant_added',
            actor: null,
            source: 'system',
            metadata: { jiraIssueKey, requesterEmail: request.requesterEmail },
          },
        ],
      })
    } catch (postCreateError) {
      const details = errorDetails(postCreateError)
      const warning = truncate(`Jira was created, but post-create verification or participant sync needs attention: ${details.code}: ${details.message}`, 1000)
      await prisma.trainingRequest.update({
        where: { id: requestId },
        data: {
          jiraSyncError: warning,
          actions: {
            create: {
              action: 'jira_post_create_sync_failed',
              actor: null,
              source: 'system',
              metadata: { code: details.code, message: truncate(details.message, 1000), requestId: details.requestId ?? null, status: details.status ?? null },
            },
          },
        },
      })
    }
  } catch (error) {
    const { code, message, requestId: acosRequestId, status } = errorDetails(error)
    const jiraSyncStatus = requiresApproval(code) ? 'PENDING_APPROVAL' : 'FAILED'
    const requestTrace = acosRequestId ? `; acosRequest=${acosRequestId}` : ''
    const jiraSyncError = truncate(
      `${code}: ${message} | project=${projectKey}; requestType=${requestType}${requestTrace}`,
      1000
    )
    console.error(`[jira] ${requestId} create-customer-request failed: ${jiraSyncError}`)

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
            metadata: { code, message: truncate(message, 1000), requestId: acosRequestId ?? null, status: status ?? null },
          },
        },
      },
    })
  }
}

export async function syncJiraCommentForMessage(requestId: string, messageId: string): Promise<void> {
  if (!jiraCommentSyncEnabled()) return

  const prisma = getPrisma()
  const [request, message] = await Promise.all([
    prisma.trainingRequest.findUnique({ where: { id: requestId }, select: { jiraIssueKey: true } }),
    prisma.requestMessage.findFirst({ where: { id: messageId, requestId } }),
  ])
  if (!request?.jiraIssueKey || !message) return

  const isPublic = message.role === 'STAKEHOLDER'
  try {
    await jiraClient().call(
      'jira',
      'add-customer-request-comment',
      {
        issueIdOrKey: request.jiraIssueKey,
        body: `Enablement Do-er ${isPublic ? 'stakeholder' : 'operator'} update from ${message.author}:\n\n${message.body}`,
        public: isPublic,
      },
      { idempotencyKey: `enablement-doer:jsm-comment:${requestId}:${messageId}` }
    )
    await prisma.requestAction.create({
      data: {
        requestId,
        action: 'jira_comment_synced',
        actor: message.author,
        source: 'system',
        metadata: { messageId, public: isPublic, jiraIssueKey: request.jiraIssueKey },
      },
    })
  } catch (error) {
    const details = errorDetails(error)
    await prisma.requestAction.create({
      data: {
        requestId,
        action: requiresApproval(details.code) ? 'jira_comment_pending_approval' : 'jira_comment_sync_failed',
        actor: message.author,
        source: 'system',
        metadata: { messageId, public: isPublic, code: details.code, message: truncate(details.message, 1000), requestId: details.requestId ?? null, status: details.status ?? null },
      },
    })
  }
}

export async function syncJiraContextForRequest(
  requestId: string,
  update: { eventKey: string; heading: string; details: string; actor: string | null }
): Promise<void> {
  if (!jiraCommentSyncEnabled()) return

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
  if (!request?.jiraIssueKey) return

  try {
    await jiraClient().call(
      'jira',
      'add-customer-request-comment',
      {
        issueIdOrKey: request.jiraIssueKey,
        body: contextCommentText(request, update.heading, update.details),
        public: false,
      },
      { idempotencyKey: `enablement-doer:jsm-context:${requestId}:${update.eventKey}` }
    )
    await prisma.requestAction.create({
      data: {
        requestId,
        action: 'jira_context_synced',
        actor: update.actor,
        source: 'system',
        metadata: { eventKey: update.eventKey, jiraIssueKey: request.jiraIssueKey, public: false },
      },
    })
  } catch (error) {
    const details = errorDetails(error)
    await prisma.requestAction.create({
      data: {
        requestId,
        action: requiresApproval(details.code) ? 'jira_context_pending_approval' : 'jira_context_sync_failed',
        actor: update.actor,
        source: 'system',
        metadata: { eventKey: update.eventKey, code: details.code, message: truncate(details.message, 1000), requestId: details.requestId ?? null, status: details.status ?? null },
      },
    })
  }
}
