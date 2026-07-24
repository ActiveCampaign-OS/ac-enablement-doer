const MAX_FIELD_LENGTH = 1_200

export interface DataWizardBriefInput {
  title: string
  description: string
  requestType: string | null
  businessImpact: string | null
  successMeasures: string | null
  desiredBehavior: string | null
  audience: string | null
  urgency: string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_FIELD_LENGTH)
}

function section(label: string, value: string | null | undefined): string | null {
  const text = clean(value)
  return text ? `${label}: ${text}` : null
}

export function buildDataWizardBrief(input: DataWizardBriefInput): string {
  const context = [
    section('Request title', input.title),
    section('Situation', input.description),
    section('Requester starting point', input.requestType),
    section('Business impact to investigate', input.businessImpact),
    section('Success measures to validate', input.successMeasures),
    section('Desired behavior change', input.desiredBehavior),
    section('Audience', input.audience),
    section('Timing context', input.urgency),
  ].filter((item): item is string => Boolean(item))

  return `I am evaluating an Enablement support request. Help me determine whether the stated problem is best addressed by an existing self-serve resource, a coaching aid, Enablement partnership, or a non-training fix.

Request context (operator-reviewed; do not infer facts beyond it):
${context.join('\n') || 'No usable request context was supplied.'}

Please work in this order:
1. Identify the canonical BI definitions, approved dashboards, Explores, and known data-quality caveats that apply before proposing SQL.
2. State the smallest read-only analysis plan that could validate the business impact, current behavior, and audience scope. Prefer an existing dashboard or Explore when it already answers the question.
3. If no approved asset answers it, provide a Snowflake query proposal with the source tables, filters, metric definitions, date range, and caveats. Do not modify data or create a dashboard.
4. Return a concise decision-oriented summary: evidence, limitations, and what it suggests about the right Enablement support route.

Do not include or seek requester email addresses, stakeholder names, customer PII, or account-level data unless the operator explicitly adds a justified, approved need.`
}
