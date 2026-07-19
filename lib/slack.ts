import { callAcos, listVendors } from './acos-client'
import type { TrainingRequest } from '@prisma/client'

type Block = Record<string, unknown>

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ac-enablement-doer.ac-spark.com').replace(/\/$/, '')
}

function channelId(): string | null {
  return process.env.SLACK_CHANNEL_ID?.trim() || null
}

export interface SlackAccessCheck {
  channelConfigured: boolean
  acosEnv: { url: boolean; appId: boolean; apiKey: boolean }
  slackVendor?: { found: boolean; appAccess?: string }
  vendorsError?: string
}

export async function checkSlackAccess(): Promise<SlackAccessCheck> {
  const out: SlackAccessCheck = {
    channelConfigured: !!channelId(),
    acosEnv: {
      url: !!process.env.ACOS_DATA_URL,
      appId: !!process.env.ACOS_APP_ID,
      apiKey: !!process.env.ACOS_API_KEY,
    },
  }
  try {
    const vendors = await listVendors()
    const slack = vendors.find((vendor) => {
      const record = vendor as Record<string, unknown>
      return record.slug === 'slack' || record.vendor === 'slack' || record.name === 'slack'
    }) as Record<string, unknown> | undefined
    out.slackVendor = slack ? { found: true, appAccess: typeof slack.appAccess === 'string' ? slack.appAccess : undefined } : { found: false }
  } catch (error) {
    out.vendorsError = error instanceof Error ? error.message : String(error)
  }
  return out
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
  const channel = channelId()
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
