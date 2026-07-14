// Thin gateway client for ACOS-Data. Replaces the official SDK
// (@activecampaign-os/data-client) which forced a github: git dep
// that kept breaking Spark's Docker build chain (SSH auth, key
// scopes, lockfile normalization). The wire protocol is documented:
//
//   POST {ACOS_DATA_URL}/v1/vendors/{vendor-slug}/{endpoint-slug}
//   X-ACOS-App-Id: $ACOS_APP_ID
//   X-ACOS-Api-Key: $ACOS_API_KEY
//   Content-Type: application/json
//   Body: { "params": { ...endpoint params... } }
//
// Spark auto-injects the three env vars when 'zendesk' is declared
// in spark.json acosData.vendors.
//
// The gateway error envelope:
//   { success: false, error: { code: "...", message: "...", requestId: "..." } }
// Common codes: AUTH_INVALID_KEY, ENDPOINT_NOT_FOUND, VENDOR_ERROR.

export class AcosError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
    public status?: number
  ) {
    super(message)
    this.name = 'AcosError'
  }
}

export interface AcosResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

/**
 * Call an ACOS vendor endpoint. `params` is wrapped per the gateway
 * convention — most vendor endpoints expect {"params": {...}}.
 */
export async function callAcos<T = unknown>(
  vendor: string,
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<AcosResponse<T>> {
  const url = process.env.ACOS_DATA_URL
  const appId = process.env.ACOS_APP_ID
  const apiKey = process.env.ACOS_API_KEY

  if (!url || !appId || !apiKey) {
    throw new AcosError(
      'ENV_MISSING',
      'ACOS_DATA_URL / ACOS_APP_ID / ACOS_API_KEY must be set (auto-injected on Spark when the vendor is declared in spark.json acosData.vendors)'
    )
  }

  const target = `${url.replace(/\/$/, '')}/v1/vendors/${vendor}/${endpoint}`

  let resp: Response
  try {
    resp = await fetch(target, {
      method: 'POST',
      headers: {
        'X-ACOS-App-Id': appId,
        'X-ACOS-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ params }),
      // Zendesk ticket payloads are enormous (~50KB per row of
      // custom_fields). per_page=25 typically completes in 8–12s
      // through the gateway; 60s leaves headroom for slow pages
      // without indefinitely hanging the caller.
      signal: AbortSignal.timeout(60000),
    })
  } catch (err) {
    // undici's `TypeError: fetch failed` hides the actual cause
    // (ECONNRESET, UND_ERR_SOCKET, etc.) on err.cause. Drill in so
    // the log line tells us whether the gateway dropped us, the TCP
    // socket reset, DNS failed, or our own AbortSignal fired.
    const msg = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'Unknown'
    const cause =
      err instanceof Error && err.cause
        ? err.cause instanceof Error
          ? `${err.cause.name}: ${err.cause.message}` +
            // @ts-expect-error undici sets `.code` on system errors
            (err.cause.code ? ` (code=${err.cause.code})` : '')
          : String(err.cause)
        : null
    const detail = cause ? `${name}: ${msg} — cause: ${cause}` : `${name}: ${msg}`
    throw new AcosError('NETWORK_ERROR', `ACOS fetch failed: ${detail}`)
  }

  const text = await resp.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new AcosError(
      'INVALID_RESPONSE',
      `Non-JSON response (HTTP ${resp.status}): ${text.slice(0, 200)}`,
      undefined,
      resp.status
    )
  }

  const envelope = body as {
    success?: boolean
    data?: T
    error?: { code?: string; message?: string; requestId?: string }
    meta?: Record<string, unknown>
  }

  if (!resp.ok || envelope?.success === false) {
    const code = envelope?.error?.code ?? `HTTP_${resp.status}`
    const message = envelope?.error?.message ?? `Gateway returned HTTP ${resp.status}`
    throw new AcosError(code, message, envelope?.error?.requestId, resp.status)
  }

  return {
    data: (envelope?.data ?? envelope) as T,
    meta: envelope?.meta,
  }
}

/**
 * Convenience: list registered vendors for this app, with appAccess
 * per the platform docs. Used by /api/diagnostics/acos.
 */
export async function listVendors(): Promise<unknown[]> {
  const url = process.env.ACOS_DATA_URL
  const appId = process.env.ACOS_APP_ID
  const apiKey = process.env.ACOS_API_KEY
  if (!url || !appId || !apiKey) {
    throw new AcosError('ENV_MISSING', 'ACOS env vars not set')
  }
  const resp = await fetch(`${url.replace(/\/$/, '')}/v1/vendors`, {
    headers: {
      'X-ACOS-App-Id': appId,
      'X-ACOS-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    throw new AcosError(
      `HTTP_${resp.status}`,
      `listVendors failed: ${resp.status}`,
      undefined,
      resp.status
    )
  }
  // The gateway envelope is { success, data: [...] } for the vendor
  // catalog. We unwrap `data` here; if a future variant returns a
  // bare array or { vendors: [...] }, fall back gracefully.
  const body = (await resp.json()) as
    | { success?: boolean; data?: unknown[]; vendors?: unknown[] }
    | unknown[]
  if (Array.isArray(body)) return body
  if (Array.isArray(body.data)) return body.data
  return body.vendors ?? []
}
