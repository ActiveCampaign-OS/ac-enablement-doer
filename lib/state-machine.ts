import type { RequestStatus, DeliverableType, Autonomy } from '@prisma/client'

// Legal lifecycle transitions. Everything else 422s at the action route.
// Phase-2 states (GENERATING, DRAFT_READY) are wired now so the map never
// needs revisiting when asset generation lands.
export const STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  SUBMITTED: ['ASSESSING', 'DECLINED', 'ARCHIVED'],
  ASSESSING: ['RECOMMENDED', 'NEEDS_INFO', 'SUBMITTED'], // SUBMITTED = retry on error
  NEEDS_INFO: ['ASSESSING', 'DECLINED', 'ARCHIVED'],
  RECOMMENDED: ['CONFIRMED', 'NEEDS_INFO', 'DECLINED'],
  CONFIRMED: ['HANDOFF_REQUIRED', 'GENERATING', 'ARCHIVED'],
  GENERATING: ['DRAFT_READY', 'CONFIRMED'], // phase 2 (CONFIRMED = retry)
  DRAFT_READY: ['APPROVED', 'GENERATING'], // phase 2 (GENERATING = regenerate)
  HANDOFF_REQUIRED: ['APPROVED', 'DECLINED'],
  APPROVED: ['DELIVERED'],
  DELIVERED: ['ARCHIVED'],
  DECLINED: ['SUBMITTED', 'ARCHIVED'], // SUBMITTED = reopen
  ARCHIVED: ['SUBMITTED'], // reopen
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (STATUS_TRANSITIONS[from] ?? []).includes(to)
}

// Which deliverable types the agent may build autonomously vs which always
// require a human build. Derived SERVER-SIDE from the recommended type —
// never trust the LLM output for this gate.
export const DELIVERABLE_AUTONOMY: Record<DeliverableType, Autonomy> = {
  JOB_AID: 'AUTONOMOUS',
  MANAGER_GUIDE: 'AUTONOMOUS',
  DECK: 'AUTONOMOUS',
  SOLIDROAD_SIM_SPEC: 'HUMAN_HANDOFF', // no Solidroad API — agent writes the spec, human builds
  RISE_COURSE: 'HUMAN_HANDOFF', // policy gate: Rise builds always go through a human
  OTHER: 'HUMAN_HANDOFF',
  SELF_SERVE_RESOURCE: 'AUTONOMOUS', // confirmation closes with the supplied self-serve route; no asset build
}

export const DECLINE_CATEGORIES = [
  'wrong_deliverable',
  'not_training_problem',
  'duplicate_request',
  'too_big_for_agent',
  'no_longer_needed',
  'other',
] as const
export type DeclineCategory = (typeof DECLINE_CATEGORIES)[number]
