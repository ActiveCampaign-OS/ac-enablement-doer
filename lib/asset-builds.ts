import type { AssetArtifactKind, AssetBuildStatus, DeliverableType } from '@prisma/client'

export const ASSET_BUILD_PHASE_LABELS: Record<AssetBuildStatus, string> = {
  QUEUED: 'Waiting for the asset builder',
  RUNNING: 'Building the draft',
  DRAFT_READY: 'Draft ready for review',
  APPROVED: 'Draft approved',
  DELIVERED: 'Delivered',
  FAILED: 'Build needs a retry',
}

function assetFileStem(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'enablement-asset'
  )
}

export function assetArtifactFileName(title: string, kind: AssetArtifactKind): string {
  const suffix: Record<AssetArtifactKind, string> = {
    MARKDOWN: 'draft.md',
    DECK_STORYBOARD: 'deck-storyboard.json',
    DOCX: 'document.docx',
  }
  return `${assetFileStem(title)}-${suffix[kind]}`
}

export function assetBuildFileName(title: string, deliverableType: DeliverableType): string {
  return assetArtifactFileName(title, deliverableType === 'DECK' ? 'DECK_STORYBOARD' : 'MARKDOWN')
}
