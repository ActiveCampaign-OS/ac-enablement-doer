import type { RequestStatus } from '@prisma/client'

const STYLES: Record<RequestStatus, string> = {
  SUBMITTED: 'nb-status-submitted',
  ASSESSING: 'nb-status-assessing',
  NEEDS_INFO: 'nb-status-info',
  RECOMMENDED: 'nb-status-recommended',
  CONFIRMED: 'nb-status-confirmed',
  GENERATING: 'nb-status-generating',
  DRAFT_READY: 'nb-status-draft',
  HANDOFF_REQUIRED: 'nb-status-handoff',
  APPROVED: 'nb-status-approved',
  DELIVERED: 'nb-status-delivered',
  DECLINED: 'nb-status-declined',
  ARCHIVED: 'nb-status-archived',
}

const LABELS: Partial<Record<RequestStatus, string>> = {
  NEEDS_INFO: 'NEEDS INFO',
  HANDOFF_REQUIRED: 'HUMAN BUILD',
  DRAFT_READY: 'DRAFT READY',
}

export function StatusChip({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`nb-status shrink-0 ${STYLES[status] ?? STYLES.SUBMITTED}`}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
