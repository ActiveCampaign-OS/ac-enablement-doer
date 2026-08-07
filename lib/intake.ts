export const REQUEST_TYPE_OPTIONS = [
  'HELP_ME_DIAGNOSE',
  'SELF_SERVE_RESOURCE',
  'COACHING_SUPPORT',
  'ENABLEMENT_PARTNERSHIP',
  'OTHER',
] as const

export type RequestType = (typeof REQUEST_TYPE_OPTIONS)[number]

export const INTAKE_MODES = ['FORM', 'GUIDED_CHAT'] as const
export type IntakeMode = (typeof INTAKE_MODES)[number]

export const INTAKE_FIELD_KEYS = [
  'title',
  'description',
  'businessImpact',
  'successMeasures',
  'desiredBehavior',
  'audience',
  'urgency',
  'stakeholders',
  'sourceMaterials',
  'accountability',
] as const

export type IntakeField = (typeof INTAKE_FIELD_KEYS)[number]

export type IntakeValues = Record<IntakeField, string> & {
  requestType: RequestType
  dueDate: string
}

export const INTAKE_FIELD_LABELS: Record<IntakeField, string> = {
  title: 'Brief request title',
  description: 'What is happening?',
  businessImpact: 'Business impact',
  successMeasures: 'Success measures',
  desiredBehavior: 'Desired behavior change',
  audience: 'Required audience',
  urgency: 'Desired timeline',
  stakeholders: 'Key stakeholders',
  sourceMaterials: 'Available source materials',
  accountability: 'Reinforcement and accountability',
}

export const INTAKE_FALLBACK_QUESTIONS: Record<IntakeField, string> = {
  title: 'Give this request a short name. If you are not sure, describe the change and I will suggest one for review.',
  description: 'What is changing or not working? Tell me about the initiative, process, or challenge without worrying about the solution yet.',
  businessImpact: 'What business result is at risk or needs to improve because of this?',
  successMeasures: 'How will you know this worked? A KPI, quality signal, manager observation, or customer signal all count.',
  desiredBehavior: 'What should people do differently, when should they do it, and what does good look like?',
  audience: 'Who needs support? Include teams or roles and whether participation is required or recommended.',
  urgency: 'When does this need to happen? Include launch dates, hard deadlines, and dependencies if you know them.',
  stakeholders: 'Who will advocate, approve, review, or provide subject-matter expertise?',
  sourceMaterials: 'What materials already exist? Paste links or describe decks, process docs, recordings, or work still in progress.',
  accountability: 'After support is delivered, how will managers or leaders reinforce the new behavior?',
}

export function emptyIntakeValues(): IntakeValues {
  return {
    title: '',
    description: '',
    requestType: 'HELP_ME_DIAGNOSE',
    businessImpact: '',
    successMeasures: '',
    desiredBehavior: '',
    audience: '',
    urgency: '',
    dueDate: '',
    stakeholders: '',
    sourceMaterials: '',
    accountability: '',
  }
}

export function nextMissingIntakeField(values: IntakeValues): IntakeField | null {
  return INTAKE_FIELD_KEYS.find((field) => !values[field].trim()) ?? null
}

export function intakeIsComplete(values: IntakeValues): boolean {
  return nextMissingIntakeField(values) === null
}
