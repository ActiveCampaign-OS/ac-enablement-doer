import { NextResponse } from 'next/server'
import {
  checkJiraAccess,
  checkJiraCreateContractReadiness,
  jiraAutoCreateEnabled,
} from '@/lib/jira'
import { checkSlackAccess } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const jira = await checkJiraAccess()
  const [slack, jiraCreateContract] = await Promise.all([
    checkSlackAccess(),
    checkJiraCreateContractReadiness(jira.projectKey, jira.requestType),
  ])
  const jiraActive = jira.jiraVendor?.found && jira.jiraVendor.appAccess === 'active'
  const slackActive = slack.slackVendor?.found && slack.slackVendor.appAccess === 'active'
  const autoCreateEnabled = jiraAutoCreateEnabled()

  return NextResponse.json({
    ok: jiraActive && jiraCreateContract.ready && autoCreateEnabled && slackActive && slack.channelConfigured,
    jira: {
      ...jira,
      createCustomerRequest: {
        endpoint: 'create-customer-request',
        autoCreateEnabled,
        contract: jiraCreateContract,
        verifiedBy: jiraCreateContract.ready && autoCreateEnabled
          ? 'the next explicitly approved synthetic request'
          : 'JSM contract reads only; writes remain disabled until grants and pilot approval are complete',
      },
    },
    slack,
  })
}
