import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { restaurarDescarte } from '@/lib/db/descartes'

const ROLES = ['admin', 'ceo', 'direccion', 'asistente']

// DELETE { id } — saca el cliente de la lista de eliminados para que el sync lo vuelva a crear
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session || !ROLES.includes(session.role)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await restaurarDescarte(id)
  return NextResponse.json({ ok: true })
}
