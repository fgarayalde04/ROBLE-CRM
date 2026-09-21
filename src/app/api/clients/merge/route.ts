import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { mergeClients } from '@/lib/db/clientMerge'

const ROLES = ['admin', 'ceo', 'direccion', 'asistente']

// POST { keepId, dropIds: string[] } — fusiona cada dropId dentro de keepId
export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !ROLES.includes(session.role)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { keepId, dropIds } = await req.json()
  if (!keepId || !Array.isArray(dropIds) || dropIds.length === 0) {
    return NextResponse.json({ error: 'Faltan keepId / dropIds' }, { status: 400 })
  }
  try {
    for (const dropId of dropIds) await mergeClients(keepId, dropId)
    return NextResponse.json({ ok: true, merged: dropIds.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
