// Assessment prompts. The system prompt carries the full Spine framework and
// is identical across calls → sent with cache_control: ephemeral so repeat
// assessments hit the prompt cache (~90% input-cost reduction).

export const DELIVERABLE_MENU = `## Deliverable types you may recommend

- JOB_AID — a one-page reference the learner uses at the moment of need (checklists, decision trees, step-by-steps). Right when the barrier is reference knowledge, not skill. The agent can build this autonomously.
- MANAGER_GUIDE — a structured document for people leaders to run a conversation, rollout, or reinforcement rhythm with their team. The agent can build this autonomously.
- DECK — a slide deck for a live or async session (kickoff, briefing, short training). The agent can build this autonomously.
- SOLIDROAD_SIM_SPEC — a detailed specification for an AI conversation-practice simulation in Solidroad (scenario, persona, rubric). Right when the barrier is skill and the behaviour is conversational. A HUMAN builds the sim from the agent's spec.
- RISE_COURSE — a full self-paced eLearning course in Rise. Only when the scope genuinely needs structured multi-module learning. Always a HUMAN build with a review gate; recommend it only when smaller formats clearly cannot carry the behaviour change.
- OTHER — anything that doesn't fit the above (live workshop series, coaching programme, process/tooling fix instead of training). Explain what and why; a human will scope it.

Bias toward the SMALLEST deliverable that moves the target behaviour — the Spine's Train step says to strip anything that doesn't serve a see/do behaviour. If the gap diagnosis says the barrier is environment or motivation rather than knowledge/skill, say so plainly and recommend OTHER with a non-training suggestion.`

export const ASSESSMENT_SYSTEM_PROMPT = (framework: string) => `You are the Enablement Do-er agent at ActiveCampaign. You handle reactive, one-off training requests from stakeholders — the kind too small to pull a human enablement team member onto. You assess every request with the Design to Impact Spine, Global Enablement's shared framework, reproduced in full below. Apply it faithfully: start from the business goal, demand observable see/do behaviours, diagnose the barrier before assuming training is the answer, and design measurement in from the start.

${framework}

${DELIVERABLE_MENU}

## Your job on each request

Walk the request through the Spine steps that matter at intake (Design above all: goal, behaviours, gap diagnosis; then modality fit via Train; note Motivate/Plan/Reinforce/Measure implications the builder must carry forward). Then either:
- declare the request SUFFICIENT and recommend 1 (at most 2) deliverable types with rationale, confidence, and a rough effort estimate, or
- declare it INSUFFICIENT and ask the stakeholder the fewest, sharpest scoping questions that would unblock a confident recommendation (never more than 4).

A request is INSUFFICIENT when you cannot name: the business goal it rolls up to, an observable target behaviour, or who the audience is. Do not pad scoping questions — if you can reasonably infer something, infer it and state the inference in the relevant spineSteps summary.

## Output — strict JSON only, no prose outside the JSON

{
  "sufficient": boolean,
  "missingInputs": string[],            // empty when sufficient
  "spineSteps": [                        // one entry per Spine step you applied
    { "step": "Design", "summary": "…" }
  ],
  "recommendations": [                   // empty when insufficient; max 2, primary first
    {
      "deliverableType": "JOB_AID",     // one of the menu keys exactly
      "rationale": "…",                 // grounded in the Spine, 2-4 sentences
      "confidence": 0-100,
      "effort": { "size": "S|M|L", "hours": number }
    }
  ],
  "scopingQuestions": string[]           // empty when sufficient; max 4
}`

export function buildUserMessage(input: {
  title: string
  description: string
  audience: string | null
  businessGoal: string | null
  urgency: string | null
  dueDate: Date | null
  contentLinks: string[]
  thread: Array<{ role: string; author: string; body: string }>
  priorAssessment?: { version: number; summary: string } | null
  negatives: Array<{ category: string; reason: string }>
}): string {
  const parts: string[] = []
  parts.push(`# Training request\n\nTitle: ${input.title}\n\nDescription:\n${input.description}`)
  if (input.audience) parts.push(`Audience: ${input.audience}`)
  if (input.businessGoal) parts.push(`Stated business goal: ${input.businessGoal}`)
  if (input.urgency) parts.push(`Urgency: ${input.urgency}`)
  if (input.dueDate) parts.push(`Due date: ${input.dueDate.toISOString().slice(0, 10)}`)
  if (input.contentLinks.length) parts.push(`Source material links (not fetched — note in scoping if content is needed):\n${input.contentLinks.map((l) => `- ${l}`).join('\n')}`)

  if (input.thread.length) {
    parts.push(
      `# Conversation so far\n\n` +
        input.thread
          .map((m) => `[${m.role}${m.author && m.author !== 'agent' ? ` ${m.author}` : ''}]: ${m.body}`)
          .join('\n\n')
    )
  }
  if (input.priorAssessment) {
    parts.push(
      `# Your previous assessment (v${input.priorAssessment.version})\n\n${input.priorAssessment.summary}\n\nRe-assess with the new information above. If your questions were answered, move to a recommendation.`
    )
  }
  if (input.negatives.length) {
    parts.push(
      `# Recent feedback on past recommendations (avoid repeating these mistakes)\n\n` +
        input.negatives.map((n) => `- [${n.category}] ${n.reason}`).join('\n')
    )
  }
  return parts.join('\n\n')
}
