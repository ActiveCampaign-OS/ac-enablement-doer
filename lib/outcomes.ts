// Spark Outcomes ingest.
//   POST $OUTCOMES_URL   (auto-injected by Spark; falls back to the
//                         in-cluster service URL below)
//   Authorization: Bearer $SPARK_API_KEY  (legacy alias: OUTCOMES_API_KEY)
//   Body: single {type, value?, metadata?} — SINGLE-OBJECT POSTS ONLY.
//   The documented batch envelope {outcomes:[...]} has been observed to
//   422 silently; do not use it.
//   Success: 200 + {success: true, count: N}
//
// NEVER post to https://ac-spark.com/api/outcomes/ingest — that
// hostname sits behind Cloudflare Access, which intercepts service-
// to-service POSTs and returns a 200/302 + HTML sign-in page. The
// outcome silently never lands. The in-cluster URL stays inside the
// VPC where CF Access can't touch it.
//
// Outcome slugs this app emits (must be registered by a Spark admin in
// Settings → Outcomes before first emit, or ingest 422s):
//   training-request-assessed | training-request-confirmed |
//   training-handoff-created  | training-asset-delivered

const FALLBACK_OUTCOMES_URL =
  'http://spark-platform.spark-platform.svc.cluster.local/api/outcomes/ingest'

function getOutcomesUrl(): string {
  return process.env.OUTCOMES_URL || FALLBACK_OUTCOMES_URL
}

interface OutcomePayload {
  type: string
  value?: number
  metadata?: Record<string, unknown>
}

export interface PostResult {
  ok: boolean
  status: number
  body_excerpt?: string
  error?: string
}

function looksLikeCloudflareIntercept(contentType: string | null, body: string): boolean {
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('text/html')) return true
  if (body.includes('Cloudflare Access')) return true
  if (body.trimStart().toLowerCase().startsWith('<!doctype html')) return true
  return false
}

async function postBody(body: Record<string, unknown>, label: string): Promise<PostResult> {
  const apiKey = process.env.SPARK_API_KEY || process.env.OUTCOMES_API_KEY
  if (!apiKey) {
    return { ok: false, status: 0, error: 'SPARK_API_KEY not set' }
  }

  const url = getOutcomesUrl()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text().catch(() => '')
    const excerpt = text.slice(0, 240)
    const contentType = res.headers.get('content-type')

    if (looksLikeCloudflareIntercept(contentType, text)) {
      console.error(
        `[outcomes] ${label} → ${res.status} but Cloudflare Access intercepted at ${url}. ` +
          `Check process.env.OUTCOMES_URL — should be in-cluster, not ac-spark.com.`
      )
      return {
        ok: false,
        status: res.status,
        body_excerpt: excerpt,
        error: 'cloudflare_access_intercept',
      }
    }

    if (!res.ok) {
      console.error(`[outcomes] ${label} → ${res.status} ${res.statusText}: ${excerpt}`)
      return { ok: false, status: res.status, body_excerpt: excerpt }
    }
    return { ok: true, status: res.status, body_excerpt: excerpt }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error(`[outcomes] ${label} threw: ${message}`)
    return { ok: false, status: 0, error: message }
  }
}

export async function logOutcome(
  type: string,
  metadata?: Record<string, unknown>,
  value?: number
): Promise<PostResult> {
  return postBody(
    {
      type,
      ...(typeof value === 'number' ? { value } : {}),
      ...(metadata ? { metadata } : {}),
    },
    `POST ${type}`
  )
}

/** Multiple outcomes = sequential single-object POSTs (batch envelope 422s). */
export async function logOutcomes(outcomes: OutcomePayload[]): Promise<PostResult[]> {
  const results: PostResult[] = []
  for (const o of outcomes) {
    results.push(await logOutcome(o.type, o.metadata, o.value))
  }
  return results
}
