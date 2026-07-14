import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { checkOperator, operatorForbidden } from '@/lib/permissions'
import { runAssessment } from '@/lib/spine/assess'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/requests/[id]/assess — manual (re-)assessment trigger, operator-gated.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const op = checkOperator(req)
  if (!op.ok) return operatorForbidden(op.email)

  const { id } = await params
  const prisma = getPrisma()
  const request = await prisma.trainingRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  after(async () => {
    await runAssessment(id, 'ui')
  })
  return NextResponse.json({ ok: true, queued: true })
}
