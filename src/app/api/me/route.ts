import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getActorEmail, canWriteEmail, isOperatorEmail } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const email = getActorEmail(req)
  const { canWrite, enforced } = canWriteEmail(email)
  const { isOperator, enforced: operatorEnforced } = isOperatorEmail(email)
  return NextResponse.json({ email, canWrite, enforced, isOperator, operatorEnforced })
}
