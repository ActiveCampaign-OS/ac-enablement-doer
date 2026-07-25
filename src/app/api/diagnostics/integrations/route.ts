import { NextResponse } from 'next/server'
import { checkJiraAccess, checkJiraAssigneeReadiness } from '@/lib/jira'
import { checkSlackAccess } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const jira = await checkJiraAccess()
  const [slack, jiraAssignee] = await Promise.all([
    checkSlackAccess(),
    checkJiraAssigneeReadiness(jira.projectKey),
  ])
  const jiraActive = jira.jiraVendor?.found && jira.jiraVendor.appAccess === 'active'
  const slackActive = slack.slackVendor?.found && slack.slackVendor.appAccess === 'active'

  return NextResponse.json({
    ok: jiraActive && jiraAssignee.ready && slackActive && slack.channelConfigured,
    jira: {
      ...jira,
      createIssue: {
        endpoint: 'create-issue',
        declared: true,
        assignee: jiraAssignee,
        verifiedBy: 'the next submitted request',
      },
    },
    slack,
  })
}
