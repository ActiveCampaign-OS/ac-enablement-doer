import { NextResponse } from 'next/server'
import { checkJiraAccess } from '@/lib/jira'
import { checkSlackAccess } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const [jira, slack] = await Promise.all([checkJiraAccess(), checkSlackAccess()])
  const jiraActive = jira.jiraVendor?.found && jira.jiraVendor.appAccess === 'active'
  const slackActive = slack.slackVendor?.found && slack.slackVendor.appAccess === 'active'

  return NextResponse.json({
    ok: jiraActive && slackActive && slack.channelConfigured,
    jira: {
      ...jira,
      createIssue: { endpoint: 'create-issue', declared: true, verifiedBy: 'the next submitted request' },
    },
    slack,
  })
}
