import Anthropic from '@anthropic-ai/sdk'
import { getPrisma } from '@/lib/prisma'
import { parseLLMJson } from '@/lib/llm/json-parse'
import { loadFramework } from './framework'
import { ASSESSMENT_SYSTEM_PROMPT, buildUserMessage } from './prompts'
import { DELIVERABLE_AUTONOMY } from '@/lib/state-machine'
import { notifySlack, requestBlocks } from '@/lib/slack'
import { logOutcome } from '@/lib/outcomes'
import type { DeliverableType } from '@prisma/client'

const MAX_ASSESSMENT_VERSIONS = 4
const MAX_USER_CHARS = 60_000
const DEFAULT_MODEL = 'claude-sonnet-4-6'

interface Recommendation {
  deliverableType: string
  rationale: string
  confidence: number
  effort: { size: string; hours: number }
}

interface AssessmentOutput {
  sufficient: boolean
  missingInputs: string[]
  spineSteps: Array<{ step: string; summary: string }>
  recommendations: Recommendation[]
  scopingQuestions: string[]
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
    const recommendations = (parsed.recommendations ?? []).slice(0, 2).map((r) => ({
      ...r,
      deliverableType: (r.deliverableType in DELIVERABLE_AUTONOMY
        ? r.deliverableType
        : 'OTHER') as DeliverableType,
    }))
    const primary = recommendations[0] ?? null

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
        scopingQuestions: parsed.scopingQuestions ?? [],
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
              body: formatRecommendationMessage(recommendations),
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
      const questions = (parsed.scopingQuestions ?? []).slice(0, 4)
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
              body:
                `I need a little more before I can recommend the right deliverable` +
                (parsed.missingInputs?.length ? ` (missing: ${parsed.missingInputs.join('; ')})` : '') +
                `:\n\n` +
                questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
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

function formatRecommendationMessage(recs: Recommendation[]): string {
  const lines = recs.map(
    (r, i) =>
      `${i === 0 ? '**Recommendation**' : '**Alternative**'}: ${r.deliverableType} (${r.confidence}% confident, ~${r.effort?.hours ?? '?'}h ${r.effort?.size ?? ''})\n${r.rationale}`
  )
  return (
    lines.join('\n\n') +
    `\n\nIf this looks right, hit **Confirm** and I'll take it from there. If not, reply here with what's off.`
  )
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
