import { callAcos } from './acos-client'
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
  const channel = process.env.SLACK_CHANNEL_ID
  if (!channel) return false
  try {
    await callAcos('slack', 'post-message', {
      channel,
      text: text ?? 'Enablement Do-er update',
      blocks,
    })
    return true
  } catch (err) {
    console.error(`[slack] post-message failed: ${err instanceof Error ? err.message : err}`)
    return false
  }
}
