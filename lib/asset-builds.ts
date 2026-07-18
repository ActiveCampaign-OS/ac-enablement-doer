import type { AssetBuildStatus, DeliverableType } from '@prisma/client'

export const ASSET_BUILD_PHASE_LABELS: Record<AssetBuildStatus, string> = {
  QUEUED: 'Waiting for the asset builder',
  RUNNING: 'Building the draft',
  DRAFT_READY: 'Draft ready for review',
  APPROVED: 'Draft approved',
  DELIVERED: 'Delivered',
  FAILED: 'Build needs a retry',
}

export function assetBuildFileName(title: string, deliverableType: DeliverableType): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'enablement-asset'
  const suffix = deliverableType === 'DECK' ? 'deck-storyboard.json' : 'draft.md'
  return `${stem}-${suffix}`
}
