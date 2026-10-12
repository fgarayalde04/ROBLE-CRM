import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listAdvisorOptions } from '@/lib/db/users'

// GET /api/advisors — nombres de asesor para los desplegables de asignación.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listAdvisorOptions())
}
