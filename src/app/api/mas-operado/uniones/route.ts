import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { fondosMonitorParaUnir, separarFondos, unirFondos } from '@/lib/db/masOperado'

export const dynamic = 'force-dynamic'

// Uniones a mano de "Lo más operado" (fondos iguales con otro ISIN o clase).
// GET: fondos del Monitor para elegir. POST { claves, con: { claves } | { monitorId } }: unir.
// DELETE { claves }: sacarlos de la unión. Unir lo puede hacer quien arma los reportes (Research).

const claves = (v: unknown) =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string' && c.length > 3 && c.length < 400).slice(0, 50) : []

async function sesion(escribe: boolean) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const lee = hasPermission(session.role, 'orders', session.permissions) || hasPermission(session.role, 'research', session.permissions)
  if (escribe ? !hasPermission(session.role, 'research', session.permissions) : !lee) {
    return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) }
  }
  return { session }
}

export async function GET() {
  const { error } = await sesion(false)
  if (error) return error
  try {
    return NextResponse.json({ monitor: await fondosMonitorParaUnir() })
  } catch (err: any) {
    console.error('[mas-operado/uniones]', err.message)
    return NextResponse.json({ error: 'No se pudieron leer los fondos del Monitor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await sesion(true)
  if (error) return error
  const body = await req.json().catch(() => ({}))
  const origen = claves(body.claves)
  const monitorId = typeof body.con?.monitorId === 'string' && /^[0-9a-f-]{36}$/i.test(body.con.monitorId) ? body.con.monitorId : ''
  const destino = claves(body.con?.claves)
  if (!origen.length || (!monitorId && !destino.length)) {
    return NextResponse.json({ error: 'Faltan los fondos a unir' }, { status: 400 })
  }
  try {
    await unirFondos(origen, monitorId ? { monitorId } : { claves: destino }, session.name)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[mas-operado/uniones]', err.message)
    return NextResponse.json({ error: 'No se pudo unir' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await sesion(true)
  if (error) return error
  const body = await req.json().catch(() => ({}))
  const origen = claves(body.claves)
  if (!origen.length) return NextResponse.json({ error: 'Faltan los fondos' }, { status: 400 })
  try {
    await separarFondos(origen)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[mas-operado/uniones]', err.message)
    return NextResponse.json({ error: 'No se pudo separar' }, { status: 500 })
  }
}
