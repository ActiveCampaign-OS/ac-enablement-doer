import { callAcos, AcosError, listVendors } from './acos-client'
import { decodeHtmlEntities } from './markdown'

// Confluence access via the ACOS-Data gateway (vendor `confluence`), following
// the Below D(ARC) pattern: Confluence is ENRICHMENT, never a hard dependency.
// The audit runs on its indexed/static context (Zendesk articles, the Help
// Center Style Guide in lib/style-guide.ts); a live Confluence excerpt is a
// best-effort augmentation that must degrade gracefully when Confluence is
// slow, gated, or unprovisioned.
//
// We go through the same thin callAcos() client the rest of the app uses — NOT
// the @activecampaign-os/data-client SDK (its git dep breaks Spark's Docker
// build). Declare `confluence` in spark.json acosData.vendors so Spark injects
// the ACOS env vars and the gateway grants appAccess.

// Confluence Cloud (v2) puts page body in `body.storage.value` etc.; the v1
// search API surfaces an `excerpt`. Different endpoints / gateway adapters nest
// it differently, so parse defensively and fall back to whatever text we can find.
export function getConfluenceText(payload: any): string {
  return (
    payload?.body?.storage?.value ??
    payload?.body?.view?.value ??
    payload?.body?.atlas_doc_format?.value ??
    payload?.page?.body?.storage?.value ??
    payload?.page?.body?.view?.value ??
    payload?.page?.body?.atlas_doc_format?.value ??
    payload?.content?.body?.storage?.value ??
    payload?.content?.body?.view?.value ??
    payload?.value ??
    payload?.excerpt ??
    payload?.title ??
    ''
  )
}

// Confluence bodies are HTML (storage/view format). Strip tags + decode entities
// before feeding to an LLM. Search excerpts wrap matches in @@@hl@@@ markers when
// excerpt=highlight is requested — drop those too.
export function stripConfluenceHtml(html: string): string {
  return decodeHtmlEntities(
    String(html ?? '')
      .replace(/@@@(end)?hl@@@/g, '')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain-text of a Confluence payload, ready for prompt context. */
export function confluencePlainText(payload: any): string {
  return stripConfluenceHtml(getConfluenceText(payload))
}

// The ACOS gateway sheds load with "too many in-flight vendor requests" under
// pressure. A single retry usually clears it; more than that isn't worth the
// wait for an enrichment call.
function isInFlightPressure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /too many in-?flight|in-?flight vendor requests|rate.?limit|429/i.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Call a Confluence endpoint through ACOS. Retries once on gateway in-flight
 * pressure. Throws AcosError on real failures (so diagnostics can surface them);
 * enrichment callers should use the best-effort helpers below instead.
 */
export async function callConfluence<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  try {
    const { data } = await callAcos<T>('confluence', endpoint, params)
    return data
  } catch (err) {
    if (isInFlightPressure(err)) {
      await sleep(750)
      const { data } = await callAcos<T>('confluence', endpoint, params)
      return data
    }
    throw err
  }
}

// Confluence Query Language search. `excerpt: 'highlight'` returns match snippets;
// pass excerpt: 'none' to skip them.
export async function searchConfluence(
  cql: string,
  opts: { limit?: number; excerpt?: 'highlight' | 'indexed' | 'none' } = {}
): Promise<unknown> {
  return callConfluence('search', {
    cql,
    excerpt: opts.excerpt ?? 'highlight',
    limit: opts.limit ?? 5,
  })
}

// Two candidate endpoints exist depending on the gateway adapter; get-page-body
// is what Below D(ARC) uses. get-page (with bodyFormat) is the fallback shape.
export async function getConfluencePageBody(id: string): Promise<unknown> {
  return callConfluence('get-page-body', { id })
}

const ENRICH_TIMEOUT_MS = 8000

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Confluence enrichment timed out after ${ms}ms`)), ms)
    ),
  ])
}

export interface ConfluenceExcerpt {
  title: string | null
  text: string
  id: string | null
}

/**
 * Best-effort Confluence enrichment for a topic. Returns the top matching page's
 * excerpt as plain text, or null if Confluence is slow / gated / empty. NEVER
 * throws — the caller's audit must proceed on its indexed context regardless.
 * This is the Below D(ARC) "enrich, don't depend" seam: wire it into a prompt as
 * optional extra context, gated behind a config flag.
 */
export async function enrichFromConfluence(topic: string): Promise<ConfluenceExcerpt | null> {
  const q = topic.replace(/"/g, '').trim()
  if (!q) return null
  try {
    const cql = `type=page AND (title~"${q}" OR text~"${q}")`
    const raw: any = await withTimeout(
      searchConfluence(cql, { limit: 1, excerpt: 'highlight' }),
      ENRICH_TIMEOUT_MS
    )
    // Search responses vary: { results: [...] } | { data: [...] } | bare array.
    const first =
      raw?.results?.[0] ?? raw?.data?.[0] ?? (Array.isArray(raw) ? raw[0] : null) ?? raw
    if (!first) return null
    const text = confluencePlainText(first)
    if (!text) return null
    return {
      title: first?.title ?? first?.content?.title ?? null,
      text,
      id: first?.id ?? first?.content?.id ?? null,
    }
  } catch (err) {
    // Enrichment is optional; log and move on.
    console.warn(
      `[confluence] enrichment skipped for "${topic}": ${err instanceof Error ? err.message : err}`
    )
    return null
  }
}

// Diagnostic: is the confluence vendor provisioned for this app? Mirrors
// checkJiraAccess — spark.json is only a request; the gateway is authoritative.
export interface ConfluenceAccessCheck {
  acosEnv: { url: boolean; appId: boolean; apiKey: boolean }
  confluenceVendor?: { found: boolean; appAccess?: string; raw?: unknown }
  vendorsError?: string
}

export async function checkConfluenceAccess(): Promise<ConfluenceAccessCheck> {
  const out: ConfluenceAccessCheck = {
    acosEnv: {
      url: !!process.env.ACOS_DATA_URL,
      appId: !!process.env.ACOS_APP_ID,
      apiKey: !!process.env.ACOS_API_KEY,
    },
  }
  try {
    const vendors = await listVendors()
    const conf = vendors.find((v) => {
      const slug = (v as any)?.slug ?? (v as any)?.vendor ?? (v as any)?.name
      return slug === 'confluence'
    })
    out.confluenceVendor = conf
      ? { found: true, appAccess: (conf as any).appAccess, raw: conf }
      : { found: false }
  } catch (err) {
    out.vendorsError = err instanceof Error ? err.message : String(err)
  }
  return out
}

export { AcosError }
