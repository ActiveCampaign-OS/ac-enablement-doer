import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { canAccessRequest, getActorEmail, checkWrite, writeForbidden, isOperatorEmail } from '@/lib/permissions'
import { runAssessment } from '@/lib/spine/assess'
import { syncJiraCommentForMessage } from '@/lib/jira'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/requests/[id]/messages  { body }
// A stakeholder reply while the request sits in NEEDS_INFO (or a push-back in
// RECOMMENDED) re-triggers assessment inside after() — the response returns
// immediately and the agent re-assesses with the new information.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const perm = checkWrite(req)
  if (!perm.ok) return writeForbidden(perm.email)

  const { id } = await params
  const payload = await req.json().catch(() => ({}))
  const body = String(payload.body ?? '').trim()
  if (!body) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  const email = getActorEmail(req)
  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessRequest(email, request.requesterEmail)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { isOperator } = isOperatorEmail(email)
  const role =
    email && email === request.requesterEmail ? 'STAKEHOLDER' : isOperator ? 'OPERATOR' : 'STAKEHOLDER'

  const message = await prisma.requestMessage.create({
    data: { requestId: id, role, author: email ?? 'unknown', body },
  })
  await prisma.trainingRequest.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  })

  // A stakeholder answer in NEEDS_INFO (or a substantive push-back while
  // RECOMMENDED) sends the request back through assessment.
  const shouldReassess =
    role === 'STAKEHOLDER' && ['NEEDS_INFO', 'RECOMMENDED'].includes(request.status)
  if (request.jiraIssueKey) {
    after(async () => {
      await syncJiraCommentForMessage(id, message.id)
    })
  }
  if (shouldReassess) {
    after(async () => {
      await runAssessment(id, 'system')
    })
  }

  return NextResponse.json({ message, reassessing: shouldReassess }, { status: 201 })
}
