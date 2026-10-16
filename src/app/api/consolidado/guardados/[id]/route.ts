import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { deleteConsolidado, esDuenoConsolidado, getConsolidado, setCompartido } from '@/lib/db/consolidados'

export const dynamic = 'force-dynamic'

async function cargar(id: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) }
  const row = await getConsolidado(id).catch(() => null)
  if (!row) return { error: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) }
  if (!esDuenoConsolidado(row, session)) {
    return { error: NextResponse.json({ error: 'Solo quien lo armó puede hacer esto' }, { status: 403 }) }
  }
  return { session, row }
}

// DELETE /api/consolidado/guardados/[id] — solo quien lo armó
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await cargar(params.id)
  if (r.error) return r.error
  await deleteConsolidado(params.id)
  return NextResponse.json({ ok: true })
}

// PATCH /api/consolidado/guardados/[id] { compartidoCon: string[] } — con qué
// usuarios se comparte (reemplaza la lista). Solo quien lo armó.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await cargar(params.id)
  if (r.error) return r.error
  const body = await req.json().catch(() => null)
  const ids = Array.isArray(body?.compartidoCon) ? body.compartidoCon.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : null
  if (!ids) return NextResponse.json({ error: 'Lista de usuarios inválida' }, { status: 400 })
  await setCompartido(params.id, Array.from(new Set<string>(ids)).filter((x) => x !== r.session.id))
  return NextResponse.json({ ok: true })
}
