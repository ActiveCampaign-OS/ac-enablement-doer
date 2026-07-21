import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const DEFAULT_GLEAN_MCP_URL = 'https://activecampaign-be.glean.com/mcp/default'
const GLEAN_TOKEN_ENV_NAMES = ['GLEAN_DEFAULT_TOKEN', 'GLEAN_MCP_TOKEN', 'GLEAN_API_TOKEN', 'GLEAN_TOKEN'] as const
const CONNECT_TIMEOUT_MS = 15_000
const MAX_DESCRIPTION_LENGTH = 500

type GleanTokenEnvName = (typeof GLEAN_TOKEN_ENV_NAMES)[number]

interface GleanToolLike {
  name?: unknown
  title?: unknown
  description?: unknown
  inputSchema?: unknown
}

export interface GleanToolSummary {
  name: string
  title: string | null
  description: string | null
  inputKeys: string[]
}

export interface GleanAccessCheck {
  configured: boolean
  url: string
  tokenEnv: GleanTokenEnvName | null
  tools: GleanToolSummary[]
  agentDiscoveryTools: string[]
  error: string | null
}

function configuredToken(): { token: string; envName: GleanTokenEnvName } | null {
  for (const envName of GLEAN_TOKEN_ENV_NAMES) {
    const token = process.env[envName]?.trim()
    if (token) return { token, envName }
  }
  return null
}

function trimText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function inputKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const properties = (value as Record<string, unknown>).properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return []
  return Object.keys(properties).slice(0, 30)
}

function normalizeTool(tool: GleanToolLike): GleanToolSummary | null {
  const name = trimText(tool.name, 200)
  if (!name) return null
  return {
    name,
    title: trimText(tool.title, 300),
    description: trimText(tool.description, MAX_DESCRIPTION_LENGTH),
    inputKeys: inputKeys(tool.inputSchema),
  }
}

function discoveryTools(tools: GleanToolSummary[]): string[] {
  return tools
    .filter((tool) => /agent/.test(`${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`.toLowerCase()))
    .filter((tool) => /search|list|discover/.test(`${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`.toLowerCase()))
    .map((tool) => tool.name)
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]').slice(0, 1_000)
}

export async function checkGleanAccess(): Promise<GleanAccessCheck> {
  const configured = configuredToken()
  const url = process.env.GLEAN_MCP_URL?.trim() || DEFAULT_GLEAN_MCP_URL
  const base: GleanAccessCheck = {
    configured: Boolean(configured),
    url,
    tokenEnv: configured?.envName ?? null,
    tools: [],
    agentDiscoveryTools: [],
    error: null,
  }
  if (!configured) {
    return { ...base, error: `Missing one of: ${GLEAN_TOKEN_ENV_NAMES.join(', ')}` }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS)
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { Authorization: `Bearer ${configured.token}` },
      signal: controller.signal,
    },
  })
  const client = new Client({ name: 'ac-enablement-doer', version: '0.1.0' })

  try {
    await client.connect(transport)
    const response = await client.listTools()
    const tools = response.tools
      .map((tool) => normalizeTool(tool as GleanToolLike))
      .filter((tool): tool is GleanToolSummary => Boolean(tool))
    return { ...base, tools, agentDiscoveryTools: discoveryTools(tools) }
  } catch (error) {
    return { ...base, error: errorMessage(error) }
  } finally {
    clearTimeout(timeout)
    await transport.close().catch(() => {})
  }
}
