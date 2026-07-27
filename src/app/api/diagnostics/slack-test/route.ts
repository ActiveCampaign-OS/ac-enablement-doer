import { NextRequest, NextResponse } from 'next/server'
import { checkOperator, operatorForbidden } from '@/lib/permissions'
import { notifySlack } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const operator = checkOperator(req)
  if (!operator.ok) return operatorForbidden(operator.email)

  const posted = await notifySlack(
    [
      { type: 'header', text: { type: 'plain_text', text: '📡 Enablement Do-er connection test', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'This is a one-time Slack connection test. No request, Jira issue, learner, or asset was created.',
        },
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Sent by an authorized Enablement Do-er operator.' }] },
    ],
    'Enablement Do-er Slack connection test'
  )

  if (!posted) {
    return NextResponse.json({ ok: false, error: 'Slack did not accept the connection test. Check the application logs.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, message: 'Slack connection test posted.' })
}
