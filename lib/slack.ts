// Slack notifications via a plain incoming webhook (SLACK_WEBHOOK_URL secret).
// Best-effort by design: never throws, never blocks the request path.
// Deep links go back into the app via NEXT_PUBLIC_APP_URL.

import type { TrainingRequest } from '@prisma/client'

type Block = Record<string, unknown>

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ac-enablement-doer.ac-spark.com').replace(/\/$/, '')
}

export function requestBlocks(
  heading: string,
  request: Pick<TrainingRequest, 'id' | 'title' | 'status' | 'requesterEmail'> & {
    recommendedType?: string | null
    confirmedType?: string | null
  },
  context?: string
): Block[] {
  const type = request.confirmedType ?? request.recommendedType
  const fields = [
    `*Status:* ${request.status}`,
    ...(type ? [`*Deliverable:* ${type}`] : []),
    `*Requester:* ${request.requesterEmail}`,
  ]
  return [
    { type: 'header', text: { type: 'plain_text', text: `📋 ${heading}`, emoji: true } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${request.title}*\n${fields.join('  ·  ')}` },
    },
    ...(context ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: context }] }] : []),
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open request', emoji: true },
          url: `${appUrl()}/requests/${request.id}`,
        },
      ],
    },
  ]
}

export async function notifySlack(blocks: Block[], text?: string): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL
  if (!webhook) return false
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text ?? 'Enablement Do-er update', blocks }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[slack] webhook → ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[slack] webhook threw: ${err instanceof Error ? err.message : err}`)
    return false
  }
}
