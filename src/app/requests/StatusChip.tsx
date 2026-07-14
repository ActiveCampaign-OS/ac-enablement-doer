import type { RequestStatus } from '@prisma/client'

const STYLES: Record<RequestStatus, string> = {
  SUBMITTED: 'bg-charcoal-800 text-charcoal-200',
  ASSESSING: 'bg-ac-blue-900 text-ac-blue-300 animate-pulse',
  NEEDS_INFO: 'bg-amber-900 text-amber-300',
  RECOMMENDED: 'bg-violet-900 text-violet-300',
  CONFIRMED: 'bg-emerald-900 text-emerald-300',
  GENERATING: 'bg-ac-blue-900 text-ac-blue-300 animate-pulse',
  DRAFT_READY: 'bg-violet-900 text-violet-300',
  HANDOFF_REQUIRED: 'bg-orange-900 text-orange-300',
  APPROVED: 'bg-emerald-900 text-emerald-300',
  DELIVERED: 'bg-emerald-800 text-emerald-200',
  DECLINED: 'bg-red-950 text-red-300',
  ARCHIVED: 'bg-charcoal-900 text-charcoal-500',
}

const LABELS: Partial<Record<RequestStatus, string>> = {
  NEEDS_INFO: 'NEEDS INFO',
  HANDOFF_REQUIRED: 'HUMAN BUILD',
  DRAFT_READY: 'DRAFT READY',
}

export function StatusChip({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`shrink-0 text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full ${STYLES[status] ?? STYLES.SUBMITTED}`}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
