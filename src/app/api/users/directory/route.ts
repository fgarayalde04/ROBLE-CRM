import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listUserDirectory } from '@/lib/db/users'

// GET /api/users/directory — minimal user list (id, name, role) for any
// authenticated user. Used by chat's participant pickers. Unlike /api/users
// (admin-only, full record), this never exposes email/permissions/password.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await listUserDirectory()
  return NextResponse.json(data)
}
