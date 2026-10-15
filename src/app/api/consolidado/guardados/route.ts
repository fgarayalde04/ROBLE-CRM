import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { getConsolidado, saveConsolidado, type DatosConsolidado } from '@/lib/db/consolidados'
import { armarReporte } from '@/lib/consolidado/calc'

export const dynamic = 'force-dynamic'

// POST /api/consolidado/guardados { id?, clientName, cuentas, datos } — guarda
// (o actualiza) el consolidado. Los totales se recalculan acá con los mismos
// datos, para que la lista muestre lo mismo que el reporte.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const datos = body?.datos as DatosConsolidado | undefined
  if (!datos?.archivos || !Object.keys(datos.archivos).length) return NextResponse.json({ error: 'No hay archivos para guardar' }, { status: 400 })
  const clientName = String(body?.clientName ?? '').trim()
  if (!clientName) return NextResponse.json({ error: 'Poné el nombre del cliente antes de guardar' }, { status: 400 })

  let id: string | null = typeof body?.id === 'string' ? body.id : null
  if (id) {
    const prev = await getConsolidado(id).catch(() => null)
    if (!prev) id = null
  }
  try {
    const fecha = typeof body?.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : new Date().toISOString().slice(0, 10)
    const r = armarReporte(datos.archivos, fecha, new Set(), datos.manuales ?? {}, datos.externos ?? {})
    const nuevoId = await saveConsolidado(
      { clientName, cuentas: String(body?.cuentas ?? ''), fecha, total: r.totales.total, cuponCorrido: r.totales.cuponCorrido, datos },
      { id, userName: session.name, userId: session.id ?? null },
    )
    return NextResponse.json({ id: nuevoId })
  } catch (e) {
    console.error('[consolidado/guardar]', e)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
