import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { loadFramework, frameworkHash, SPINE_VERSION } from '@/lib/spine/framework'

// Which Spine framework copy is live: source (REPO vs CONFLUENCE refresh),
// version, hash, size — and a warning if the content still looks like a
// placeholder. Hooks-bypass webhook.
export const dynamic = 'force-dynamic'

export async function GET() {
  const prisma = getPrisma()
  const fw = await loadFramework(prisma)
  const placeholder = /TODO: paste|PLACEHOLDER/i.test(fw.content)

  let refreshedVersions = 0
  try {
    refreshedVersions = await prisma.frameworkDoc.count()
  } catch {
    /* DB may be unavailable in some diagnostic contexts — repo copy still loads */
  }

  return NextResponse.json({
    ok: !placeholder && fw.content.length > 5000,
    source: fw.source,
    version: fw.version,
    repoVersion: SPINE_VERSION,
    hash: frameworkHash(fw.content),
    chars: fw.content.length,
    sixSteps: ['Design', 'Motivate', 'Train', 'Plan', 'Reinforce', 'Measure'].every((s) =>
      fw.content.includes(`### `) && fw.content.includes(s)
    ),
    placeholderWarning: placeholder ? 'framework content still contains placeholder markers' : null,
    confluenceRefreshVersions: refreshedVersions,
  })
}
