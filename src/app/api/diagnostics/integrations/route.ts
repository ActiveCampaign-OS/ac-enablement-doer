import { NextResponse } from 'next/server'
import { checkJiraAccess, checkJiraAssigneeReadiness, checkJiraIssueTypeReadiness } from '@/lib/jira'
import { checkSlackAccess } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const jira = await checkJiraAccess()
  const [slack, jiraAssignee, jiraIssueType] = await Promise.all([
    checkSlackAccess(),
    checkJiraAssigneeReadiness(jira.projectKey),
    checkJiraIssueTypeReadiness(jira.projectKey, jira.issueType),
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
        issueType: jiraIssueType,
        verifiedBy: 'the next submitted request',
      },
    },
    slack,
  })
}
