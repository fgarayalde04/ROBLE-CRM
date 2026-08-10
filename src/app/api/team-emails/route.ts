import { NextResponse } from 'next/server'
import { getActiveUsersWithEmail } from '@/lib/db/users'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const data = await getActiveUsersWithEmail()
  return NextResponse.json(data)
}
