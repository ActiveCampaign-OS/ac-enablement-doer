import { listVendors } from './acos-client'

interface GleanVendorRecord {
  slug?: unknown
  vendor?: unknown
  name?: unknown
  appAccess?: unknown
  mcpAvailable?: unknown
}

export interface GleanAccessCheck {
  vendorFound: boolean
  appAccess: string | null
  mcpAvailable: boolean
  error: string | null
}

function isGleanVendor(value: unknown): value is GleanVendorRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as GleanVendorRecord
  return [record.slug, record.vendor, record.name].some(
    (candidate) => typeof candidate === 'string' && candidate.toLowerCase() === 'glean'
  )
}

export async function checkGleanAccess(): Promise<GleanAccessCheck> {
  try {
    const vendor = (await listVendors()).find(isGleanVendor)
    if (!vendor) {
      return {
        vendorFound: false,
        appAccess: null,
        mcpAvailable: false,
        error: 'Glean is not present in the ACOS-Data vendor catalog for this app.',
      }
    }

    const appAccess = typeof vendor.appAccess === 'string' ? vendor.appAccess : null
    const mcpAvailable = vendor.mcpAvailable === true
    if (appAccess !== 'active') {
      return {
        vendorFound: true,
        appAccess,
        mcpAvailable,
        error: `Glean vendor access is ${appAccess ?? 'unknown'}; approve the app access before use.`,
      }
    }
    if (!mcpAvailable) {
      return {
        vendorFound: true,
        appAccess,
        mcpAvailable: false,
        error: 'Glean vendor access is active, but its MCP server is not available to this app.',
      }
    }
    return { vendorFound: true, appAccess, mcpAvailable: true, error: null }
  } catch (error) {
    return {
      vendorFound: false,
      appAccess: null,
      mcpAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
