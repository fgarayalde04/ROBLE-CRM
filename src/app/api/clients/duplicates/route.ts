import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { findDuplicateGroups } from '@/lib/db/clientMerge'

const ROLES = ['admin', 'ceo', 'direccion', 'asistente']

export async function GET() {
  const session = await getSession()
  if (!session || !ROLES.includes(session.role)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  return NextResponse.json(await findDuplicateGroups())
}
