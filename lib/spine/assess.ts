import Anthropic from '@anthropic-ai/sdk'
import { getPrisma } from '@/lib/prisma'
import { parseLLMJson } from '@/lib/llm/json-parse'
import { loadFramework } from './framework'
import { ASSESSMENT_SYSTEM_PROMPT, buildUserMessage } from './prompts'
import { DELIVERABLE_AUTONOMY } from '@/lib/state-machine'
import { notifySlack, requestBlocks } from '@/lib/slack'
import { logOutcome } from '@/lib/outcomes'
import { Prisma, type DeliverableType } from '@prisma/client'

const MAX_ASSESSMENT_VERSIONS = 4
const MAX_USER_CHARS = 60_000
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const SPINE_STAGES = ['Design', 'Motivate', 'Train', 'Plan', 'Reinforce', 'Measure'] as const

type SpineStage = (typeof SPINE_STAGES)[number]
type SupportRoute = 'SELF_SERVE' | 'COACHING_ASSET' | 'ENABLEMENT_PARTNERSHIP' | 'NON_TRAINING_RESOLUTION'

const SUPPORT_ROUTES: SupportRoute[] = [
  'SELF_SERVE',
  'COACHING_ASSET',
  'ENABLEMENT_PARTNERSHIP',
  'NON_TRAINING_RESOLUTION',
]

interface Recommendation {
  deliverableType: string
  supportRoute: SupportRoute
  rationale: string
  nextStep: string
  confidence: number
  effort: { size: string; hours: number }
}

interface AssessmentOutput {
  sufficient: boolean
  missingInputs: string[]
  spineSteps: Array<{ step: string; summary: string }>
  recommendations: Recommendation[]
  scopingQuestions: string[]
  currentStage?: string
  workingNotes?: unknown
  madeMaterialProgress?: boolean
  showWorkingNotes?: boolean
  nextDecision?: unknown
}

interface WorkingNotes {
  businessGoal: string | null
  targetBehavior: string | null
  likelyGapTypes: string[]
  keyEvidence: string[]
  openRisks: string[]
  nextDecision: string | null
}

interface NextDecision {
  question: string
  options: Array<{ label: string; description: string; recommended: boolean }>
}

/**
 * Run one Spine assessment pass for a request. Owns the full lifecycle:
 * SUBMITTED/NEEDS_INFO → ASSESSING → RECOMMENDED | NEEDS_INFO (or back to
 * SUBMITTED on error). Safe to call from after() — never throws.
 */
export async function runAssessment(requestId: string, source: 'system' | 'cron' | 'ui'): Promise<void> {
  const prisma = getPrisma()
  try {
    const request = await prisma.trainingRequest.findUnique({
      where: { id: requestId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        assessments: { orderBy: { version: 'desc' }, take: 1 },
      },
    })
    if (!request) return
    if (!['SUBMITTED', 'NEEDS_INFO', 'ASSESSING', 'RECOMMENDED'].includes(request.status)) {
      console.log(`[assess] ${requestId} in ${request.status} — skipping`)
      return
    }

    const priorVersion = request.assessments[0]?.version ?? 0
    if (priorVersion >= MAX_ASSESSMENT_VERSIONS) {
      console.error(`[assess] ${requestId} hit the ${MAX_ASSESSMENT_VERSIONS}-version cap — escalating`)
      await notifySlack(
        requestBlocks(
          'Assessment loop needs a human',
          request,
          `${MAX_ASSESSMENT_VERSIONS} assessment rounds without a confirmed recommendation — an operator should step in.`
        )
      )
      return
    }

    await transition(requestId, 'ASSESSING', source)

    const framework = await loadFramework(prisma)
    const negatives = await prisma.requestFeedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { category: true, reason: true },
    })

    const prior = request.assessments[0]
    let userMsg = buildUserMessage({
      title: request.title,
      description: request.description,
      requestType: request.requestType,
      businessImpact: request.businessImpact,
      successMeasures: request.successMeasures,
      desiredBehavior: request.desiredBehavior,
      audience: request.audience,
      businessGoal: request.businessGoal,
      urgency: request.urgency,
      stakeholders: request.stakeholders,
      sourceMaterials: request.sourceMaterials,
      accountability: request.accountability,
      dueDate: request.dueDate,
      contentLinks: request.contentLinks,
      thread: request.messages.map((m) => ({ role: m.role, author: m.author, body: m.body })),
      priorAssessment: prior
        ? {
            version: prior.version,
            summary: JSON.stringify({
              sufficient: prior.sufficient,
              currentStage: prior.currentStage,
              workingNotes: prior.workingNotes,
              nextDecision: prior.nextDecision,
              nonProgressTurns: prior.nonProgressTurns,
              madeMaterialProgress: prior.madeMaterialProgress,
              recommendations: prior.recommendations,
              scopingQuestions: prior.scopingQuestions,
            }),
          }
        : null,
      negatives,
    })
    if (userMsg.length > MAX_USER_CHARS) {
      userMsg = userMsg.slice(0, MAX_USER_CHARS) + '\n\n[TRUNCATED — input exceeded the size guard]'
    }

    // Env-injected key + CrabTrap base URL. In LOCAL DEV the base URL is the
    // public ac-spark.com proxy behind Cloudflare Access — the CF service-token
    // headers from the Settings → Local Development snippet must ride along or
    // CF returns 403. In production the URL is in-cluster and these vars are
    // absent, so no headers are attached.
    const cfHeaders =
      process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET
        ? {
            'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
            'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET,
          }
        : undefined
    const anthropic = new Anthropic({ defaultHeaders: cfHeaders })
    const model = process.env.ASSESS_MODEL || DEFAULT_MODEL
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4000,
      system: [
        {
          type: 'text',
          text: ASSESSMENT_SYSTEM_PROMPT(framework.content),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMsg }],
    })
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    const parsed = parseLLMJson<AssessmentOutput>(raw, 'object')
    if (!parsed || typeof parsed.sufficient !== 'boolean') {
      throw new Error(`unparseable assessment output: ${raw.slice(0, 200)}`)
    }

    // Coerce anything off-menu to OTHER — and never trust the LLM for autonomy.
    const recommendations = (parsed.recommendations ?? []).slice(0, 2).map((r) => {
      const deliverableType = (r.deliverableType in DELIVERABLE_AUTONOMY
        ? r.deliverableType
        : 'OTHER') as DeliverableType
      return {
        ...r,
        deliverableType,
        supportRoute: normalizeSupportRoute(r.supportRoute, deliverableType),
        nextStep: normalizeText(r.nextStep) ?? 'Confirm this route or reply with what needs to change.',
      }
    })
    const primary = recommendations[0] ?? null
    const currentStage = normalizeStage(parsed.currentStage)
    const nextDecision = normalizeNextDecision(parsed.nextDecision)
    const workingNotes = normalizeWorkingNotes(parsed.workingNotes, nextDecision)
    const madeMaterialProgress = priorVersion === 0 || parsed.madeMaterialProgress === true
    const nonProgressTurns = madeMaterialProgress ? 0 : (prior?.nonProgressTurns ?? 0) + 1
    const showWorkingNotes = priorVersion === 0 || parsed.showWorkingNotes === true
    const shouldRefocus = !parsed.sufficient && nonProgressTurns >= 2
    const scopingQuestions = (parsed.scopingQuestions ?? []).map(String).filter(Boolean).slice(0, 1)

    const assessment = await prisma.assessment.create({
      data: {
        requestId,
        version: priorVersion + 1,
        model,
        frameworkVersion: `${framework.source}:${framework.version}`,
        sufficient: parsed.sufficient,
        missingInputs: parsed.missingInputs ?? [],
        spineSteps: parsed.spineSteps ?? [],
        recommendations: recommendations as unknown as object[],
        scopingQuestions,
        currentStage,
        workingNotes: workingNotes as unknown as Prisma.InputJsonValue,
        nextDecision: nextDecision ? (nextDecision as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        madeMaterialProgress,
        nonProgressTurns,
        showWorkingNotes,
        rawExcerpt: raw.slice(0, 2000),
      },
    })

    if (parsed.sufficient && primary) {
      await prisma.trainingRequest.update({
        where: { id: requestId },
        data: {
          status: 'RECOMMENDED',
          recommendedType: primary.deliverableType as DeliverableType,
          autonomy: DELIVERABLE_AUTONOMY[primary.deliverableType as DeliverableType],
          lastActivityAt: new Date(),
          actions: {
            create: {
              action: 'status_changed_to_RECOMMENDED',
              actor: null,
              source,
              metadata: { assessmentId: assessment.id, version: assessment.version, deliverableType: primary.deliverableType },
            },
          },
          messages: {
            create: {
              role: 'AGENT',
              author: 'agent',
              body: formatRecommendationMessage(recommendations, {
                currentStage,
                workingNotes,
                showWorkingNotes,
              }),
              metadata: { assessmentId: assessment.id },
            },
          },
        },
      })
      await notifySlack(
        requestBlocks(
          'Recommendation ready',
          { ...request, status: 'RECOMMENDED', recommendedType: primary.deliverableType },
          `${primary.deliverableType} (${primary.confidence}% confident, ~${primary.effort?.hours ?? '?'}h) — waiting on ${request.requesterEmail} to confirm`
        )
      )
    } else {
      await prisma.trainingRequest.update({
        where: { id: requestId },
        data: {
          status: 'NEEDS_INFO',
          lastActivityAt: new Date(),
          actions: {
            create: {
              action: 'status_changed_to_NEEDS_INFO',
              actor: null,
              source,
              metadata: { assessmentId: assessment.id, version: assessment.version },
            },
          },
          messages: {
            create: {
              role: 'AGENT',
              author: 'agent',
              body: formatScopingMessage({
                missingInputs: parsed.missingInputs ?? [],
                questions: scopingQuestions,
                currentStage,
                workingNotes,
                nextDecision,
                showWorkingNotes,
                shouldRefocus,
              }),
              metadata: { assessmentId: assessment.id },
            },
          },
        },
      })
      await notifySlack(
        requestBlocks(
          'Scoping questions posted',
          { ...request, status: 'NEEDS_INFO' },
          `v${assessment.version} assessment needs input from ${request.requesterEmail}`
        )
      )
    }

    await logOutcome('training-request-assessed', {
      requestId,
      version: assessment.version,
      sufficient: parsed.sufficient,
      deliverableType: primary?.deliverableType ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error(`[assess] ${requestId} failed: ${message}`)
    try {
      const prisma2 = getPrisma()
      await prisma2.assessment.create({
        data: {
          requestId,
          version:
            ((await prisma2.assessment.findFirst({ where: { requestId }, orderBy: { version: 'desc' } }))
              ?.version ?? 0) + 1,
          model: process.env.ASSESS_MODEL || DEFAULT_MODEL,
          frameworkVersion: 'error',
          sufficient: false,
          missingInputs: [],
          spineSteps: [],
          recommendations: [],
          scopingQuestions: [],
          error: message,
        },
      })
      await transition(requestId, 'SUBMITTED', 'system', { error: message })
      const req = await prisma2.trainingRequest.findUnique({ where: { id: requestId } })
      if (req) {
        await notifySlack(
          requestBlocks('Assessment failed', req, `\`${message.slice(0, 180)}\` — request reset to SUBMITTED for retry`)
        )
      }
    } catch (inner) {
      console.error(`[assess] ${requestId} error-handling also failed: ${inner}`)
    }
  }
}

function normalizeStage(value: unknown): SpineStage {
  return SPINE_STAGES.includes(value as SpineStage) ? (value as SpineStage) : 'Design'
}

function normalizeText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function normalizeTextList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit)
}

function defaultSupportRoute(deliverableType: DeliverableType): SupportRoute {
  if (deliverableType === 'SELF_SERVE_RESOURCE') return 'SELF_SERVE'
  if (deliverableType === 'MANAGER_GUIDE') return 'COACHING_ASSET'
  if (deliverableType === 'OTHER') return 'NON_TRAINING_RESOLUTION'
  return 'ENABLEMENT_PARTNERSHIP'
}

function normalizeSupportRoute(value: unknown, deliverableType: DeliverableType): SupportRoute {
  return SUPPORT_ROUTES.includes(value as SupportRoute)
    ? (value as SupportRoute)
    : defaultSupportRoute(deliverableType)
}

function normalizeNextDecision(value: unknown): NextDecision | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const question = normalizeText(candidate.question)
  if (!question) return null
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .map((option) => {
          if (!option || typeof option !== 'object') return null
          const fields = option as Record<string, unknown>
          const label = normalizeText(fields.label)
          if (!label) return null
          return {
            label,
            description: normalizeText(fields.description) ?? '',
            recommended: fields.recommended === true,
          }
        })
        .filter((option): option is NextDecision['options'][number] => Boolean(option))
        .slice(0, 3)
    : []
  return { question, options }
}

function normalizeWorkingNotes(value: unknown, nextDecision: NextDecision | null): WorkingNotes {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    businessGoal: normalizeText(candidate.businessGoal),
    targetBehavior: normalizeText(candidate.targetBehavior),
    likelyGapTypes: normalizeTextList(candidate.likelyGapTypes, 6),
    keyEvidence: normalizeTextList(candidate.keyEvidence, 7),
    openRisks: normalizeTextList(candidate.openRisks, 5),
    nextDecision: normalizeText(candidate.nextDecision) ?? nextDecision?.question ?? null,
  }
}

function formatWorkingNotes(currentStage: SpineStage, notes: WorkingNotes): string {
  const lines = [`**Working notes**`, `- Current stage: ${currentStage}`]
  if (notes.businessGoal) lines.push(`- Business goal: ${notes.businessGoal}`)
  if (notes.targetBehavior) lines.push(`- Target behavior: ${notes.targetBehavior}`)
  if (notes.likelyGapTypes.length) lines.push(`- Likely gaps: ${notes.likelyGapTypes.join(', ')}`)
  if (notes.keyEvidence.length) lines.push(`- Key evidence: ${notes.keyEvidence.join(' · ')}`)
  if (notes.openRisks.length) lines.push(`- Open risks: ${notes.openRisks.join(' · ')}`)
  if (notes.nextDecision) lines.push(`- Next decision: ${notes.nextDecision}`)
  return lines.join('\n')
}

function formatDecisionOptions(nextDecision: NextDecision | null): string {
  if (!nextDecision?.options.length) return ''
  return `\n\n${nextDecision.options
    .map((option, index) => {
      const recommendation = option.recommended ? ' **Recommended**' : ''
      return `${index + 1}. **${option.label}**${recommendation}${option.description ? ` — ${option.description}` : ''}`
    })
    .join('\n')}`
}

function formatScopingMessage(input: {
  missingInputs: string[]
  questions: string[]
  currentStage: SpineStage
  workingNotes: WorkingNotes
  nextDecision: NextDecision | null
  showWorkingNotes: boolean
  shouldRefocus: boolean
}): string {
  const question =
    input.nextDecision?.question ??
    input.questions[0] ??
    'What specific observable behavior should the audience perform differently, and how will you know it happened?'
  const parts: string[] = []
  if (input.shouldRefocus) {
    parts.push('It seems we may be circling without adding new signal. Would it help to refocus on the next decision?')
  }
  if (input.showWorkingNotes) parts.push(formatWorkingNotes(input.currentStage, input.workingNotes))
  const missing = input.missingInputs.length ? ` (gap: ${input.missingInputs[0]})` : ''
  parts.push(`**Next decision needed**${missing}\n${question}${formatDecisionOptions(input.nextDecision)}`)
  return parts.join('\n\n')
}

function formatRecommendationMessage(
  recs: Recommendation[],
  context: { currentStage: SpineStage; workingNotes: WorkingNotes; showWorkingNotes: boolean }
): string {
  const lines = recs.map(
    (r, i) =>
      `${i === 0 ? '**Recommendation**' : '**Alternative**'}: ${r.deliverableType} (${r.confidence}% confident, ~${r.effort?.hours ?? '?'}h ${r.effort?.size ?? ''})\n${r.rationale}`
        + `\n**Route**: ${r.supportRoute.replaceAll('_', ' ')}\n**Next step**: ${r.nextStep}`
  )
  const parts = context.showWorkingNotes ? [formatWorkingNotes(context.currentStage, context.workingNotes)] : []
  parts.push(lines.join('\n\n'))
  parts.push('**Next decision needed**\nIf this looks right, hit **Confirm** and I\'ll take it from there. If not, reply with what is off.')
  return parts.join('\n\n')
}

async function transition(
  requestId: string,
  status: 'ASSESSING' | 'SUBMITTED',
  source: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const prisma = getPrisma()
  await prisma.trainingRequest.update({
    where: { id: requestId },
    data: {
      status,
      lastActivityAt: new Date(),
      actions: {
        create: { action: `status_changed_to_${status}`, actor: null, source, metadata },
      },
    },
  })
}
