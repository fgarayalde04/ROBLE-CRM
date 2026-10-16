import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { armarReporte } from '@/lib/consolidado/calc'
import { generarPdfConsolidado } from '@/lib/consolidado/pdf'
import type { DatosConsolidado } from '@/lib/db/consolidados'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/consolidado/pdf { clientName, fecha, datos } — arma el consolidado
// con los mismos datos de la pantalla y devuelve el PDF para el cliente.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const datos = body?.datos as DatosConsolidado | undefined
  if (!datos?.archivos || !Object.keys(datos.archivos).length) return NextResponse.json({ error: 'No hay archivos cargados' }, { status: 400 })
  const fecha = typeof body?.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : new Date().toISOString().slice(0, 10)
  const cliente = String(body?.clientName ?? '').trim()

  try {
    const r = armarReporte(datos.archivos, fecha, new Set(), datos.manuales ?? {}, datos.externos ?? {}, datos.nombresCuentas ?? {})
    const pdf = await generarPdfConsolidado(r, { cliente, incluirMovimientos: datos.incluirMovimientos !== false })
    const nombre = `Portafolio${cliente ? ` - ${cliente}` : ''} ${fecha}.pdf`.replace(/[^\w .,-]/g, '')
    return new NextResponse(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"` },
    })
  } catch (e: any) {
    console.error('[consolidado/pdf]', e)
    return NextResponse.json({ error: `No se pudo generar el PDF: ${e?.message ?? e}` }, { status: 500 })
  }
}
