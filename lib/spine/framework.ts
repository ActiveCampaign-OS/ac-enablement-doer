// The Design to Impact Spine — Global Enablement's shared framework for
// designing, delivering, and measuring learning. Source of truth is the
// Confluence page "Global Enablement - The Design to Impact Spine"; this
// copy was imported from the 2026-07-14 Confluence export. A newer copy
// pulled by /api/cron/refresh-spine (FrameworkDoc row) takes precedence
// at runtime — see loadFramework().

import { createHash } from 'crypto'
import type { PrismaClient } from '@prisma/client'

export const SPINE_VERSION = '2026-07-14-confluence-export'

export const SPINE_FRAMEWORK = `# Global Enablement - The Design to Impact Spine

This is the shared framework that backs how we design, deliver, and measure learning, across the whole team.

It pulls together three things that used to live separately: Cathy Moore's Action Mapping, Dr. Ina Weinbauer-Heidel's Transfer Effectiveness research, and Kirkpatrick's evaluation model. Instead of three frameworks bolted together, it's one spine: six steps that take you from business goal to measured impact.

If you are picking up a project and need a clear path from problem to proof, start here.

## Why it matters

Before the Spine, Action Mapping, Transfer Effectiveness, and Kirkpatrick lived as three separate things people reached for at different points, if they reached for them at all. That meant inconsistent starting points across projects, no shared language for talking about what "good" looks like, and measurement that was often an afterthought rather than something built in from the start.

The Spine fixes that by making one thing true across every project, regardless of who's running it or what format it takes: every piece of work starts with a real business goal and ends with proof of whether it moved that goal. That consistency is what lets us say, with confidence, what our work is actually achieving.

## Layer 1 - The Spine

Six steps. Universal, regardless of format or audience.

| Step | What it means | Key question |
|---|---|---|
| 1. Design | Start with the business goal, not the content. | What needs to change, and is training the right answer? |
| 2. Motivate | Build readiness before training begins. | Why should people care before the session starts? |
| 3. Train | Deliver only what moves the target behaviour. | What content is truly needed to support performance? |
| 4. Plan | Turn intention into a specific commitment. | What will someone do next, and when? |
| 5. Reinforce | Make follow-through easier with the right support in place. | What simple support will help the new behaviour stick? |
| 6. Measure | Check whether the work moved the behaviour and the business goal. | What changed, and how do we know? |

## Layer 2 - The Methodology

The how behind each step.

### 1. Design

**Start with the business goal.**

Before any content is touched, Design produces three things: a clear goal statement with a measurable timeframe, observable target behaviours written in see/do terms, and a gap diagnosis that determines whether training is even the right answer.

**Example goal prompt:**

This training is for [person] to [specific observable action] so that [business goal] is achieved by [timeframe].

_Use this prompt at the start of every project to make sure the goal is clear before anything gets built._

A business goal should always roll up to our current business priorities, either directly or via proxy. The business goal can be a team-owned metric (resolution time, activation rate, whatever the team tracks) as long as you can name the company priority it rolls up to. If that line isn't clear yet, that's the first thing to work out together - it's much easier to clarify at the start than to try to trace it back at Measure.

Core moves:

- **Identify the behaviours - see/do framing.** Write behaviours in observable terms - what would tell you a learner got it? Look for actions you can witness or measure. Some examples: demonstrates, applies, completes, explains to a colleague, chooses, produces. Words like "understands," "knows," or "is aware of" can't be observed - swap them for something you could actually see someone do.
- **Diagnose the gap before designing a solution.** Four barrier types: knowledge (split into conceptual vs reference), skill, environment, motivation. The barrier type determines the solution - not every gap is a training gap.

**Why this matters:** if training isn't the right answer, no amount of good design will show impact. Getting the diagnosis right is what lets us point to results with confidence.

### 2. Motivate

**Readiness is built before training begins.**

People show up more ready to learn when they already understand why it matters to them.

**Help people see the relevance ahead of time.** A short note sent before the session that connects the training to something they actually care about - their work, their challenges, their goals.

**Assess readiness before the session.** A short pulse before training - on motivation, existing knowledge, or current skill level - gives you a baseline to measure against later. This is where your Measure data starts, not at the end. It can be as simple as a pre-survey, or pulled from data you already have.

For bigger rollouts, individual relevance isn't enough on its own - the programme needs visible support from above to land.

- **Get the right people aligned before launch.** Brief those closest to the audience ahead of time so they're reinforcing the message from the start, rather than hearing about it alongside everyone else.
- **Secure a senior advocate.** A senior voice speaking to why this matters, in their own words, carries weight that the programme team alone can't replicate.

### 3. Train

**Deliver only what moves the behaviour.**

Format-neutral - applies whether it's live, eLearning, or a job aid. The test is the same regardless of format: does this content move someone toward the observable behaviour from Design, or is it background information that could live in a reference doc instead?

Core moves:

- **Open by activating intent.** Before any content lands, help people connect to why it matters to them right now - their work, their challenges, what they want to be able to do differently. This is where relevance moves from something they read in a pre-nudge to something they feel in the room.
- **Strip anything that doesn't serve a target behaviour.** If it doesn't map back to a see/do behaviour from Design, it belongs in a job aid or reference doc.
- **Give the minimum needed to start practice.** Provide deeper guidance at the point of need, not as a front-loaded content dump.

**Practice is the point.** Information without practice doesn't transfer. Cathy Moore's Action Mapping is built on this - the training exists to create the conditions for people to practise the behaviour, not to present everything there is to know about a topic. If the design has more content than practice, that's the signal to cut.

**Every activity is a data capture opportunity.** The engagement opportunities and activities you design aren't just practice - they're potential Kirkpatrick Level 1 and Level 2 data, collected during the experience rather than chased afterwards. Where your format allows it, design activities that tell you something: is the learner engaged, and are they getting it?

### 4. Plan

**Leave with a commitment.**

A vague intention ("I'll try to use this more") rarely survives contact with a busy week. A specific, timed plan does.

**Example implementation intention:**

By [day] I will [specific action] at [time/context].

Core moves:

- **Scaffold the plan with four prompts.** What specifically will you implement? When (pick a real date)? What's the first small step? What might get in the way, and how will you handle it?
- **Name the goal and the plan separately.** "I'll use Glean for call prep" is a plan. The goal it serves might be "cut my call prep time in half." Naming both makes the connection between effort and outcome clear.
- **Keep the timeframe short.** It doesn't need to be a 60/90-day plan. "By Friday I will do this one thing" is enough to start.

### 5. Reinforce

**Make follow-through as easy as possible.**

People don't fail to apply new learning because they lack motivation - they fail because the path from session to action isn't clear enough. Reinforce removes that friction.

**The rule:** one specific, timed action is the difference between something that happens and something that doesn't. Keep it simple enough to complete in a few minutes.

Core moves:

- **Pre-training nudge.** The day before: a one-line message that tells the learner what's coming, why it matters, and what they'll be able to do afterwards.
- **Post-training nudge.** The day after: restate the commitment they made in Plan, reinforce what they're now equipped to do, and point to the minimal resources needed to get started.
- **Follow-through check-in.** A week out: did they act on their commitment? Do they need support? Keep it light - a simple self-reported pulse is enough.
- **Plan a follow-through reminder.** The format and audience will vary by project - this is an area we're actively building out.

### 6. Measure

**The data was collected throughout the design process.**

Measurement isn't a separate afterthought bolted on at the end - it's the Design step revisited. If you wrote a goal statement with a measurable business outcome in Design, Measure is where you prove whether you actually hit it.

This is where we close the loop on attribution. Every training should be able to answer: which company priority or business goal did this move, and by how much? The goal statement from Design is always your starting point.

Core moves:

- **Identify how your observable action is measured.** Before training begins, know what data will tell you the behaviour happened. This is a Design decision, not a Measure afterthought.
- **Start with a baseline.** Where are learners starting from? Ground this in past performance, industry benchmarks, or qualitative data. Without a before, you can't prove an after.
- **Define what success looks like.** Based on your baseline, what does realistic behaviour change look like for this project and in what timeframe?
- **Measure the behaviour itself.** During and after the training - are learners doing the thing? Make sure you've allowed enough time for change to realistically happen.
- **Measure against the business goal from Design.** Connect the behaviour change from pre- to post-training back to the business outcome and timeframe you committed to before you started.

## What good looks like

1. Every project starts with a business goal.
2. Target behaviours are written in observable terms.
3. Training is only used when training is the right answer.
4. Learners leave with a specific plan for action.
5. Reinforcement is built into existing (team) rhythms where possible.
6. Measurement connects back to the original goal, not just attendance or reaction.

## Further reading

| Framework | Source | Link |
|---|---|---|
| Action Mapping | Cathy Moore | blog.cathy-moore.com |
| Transfer Effectiveness (12 levers) | Dr. Ina Weinbauer-Heidel, Institute for Transfer Effectiveness | transfereffectiveness.com |
| Kirkpatrick Model | Kirkpatrick Partners | kirkpatrickpartners.com |
`

export function frameworkHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

export interface LoadedFramework {
  content: string
  version: string
  source: 'REPO' | 'CONFLUENCE'
}

/**
 * Newest Confluence-refreshed copy wins; the repo const is the fallback.
 * Never throws — assessment must always have a framework to work from.
 */
export async function loadFramework(prisma: PrismaClient): Promise<LoadedFramework> {
  try {
    const doc = await prisma.frameworkDoc.findFirst({ orderBy: { fetchedAt: 'desc' } })
    if (doc && doc.content.length > 1000) {
      return { content: doc.content, version: doc.version, source: doc.source as 'REPO' | 'CONFLUENCE' }
    }
  } catch (err) {
    console.error(`[spine] loadFramework fell back to repo copy: ${err instanceof Error ? err.message : err}`)
  }
  return { content: SPINE_FRAMEWORK, version: SPINE_VERSION, source: 'REPO' }
}
