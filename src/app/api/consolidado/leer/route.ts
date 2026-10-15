import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { grillaDeExcel } from '@/lib/consolidado/grilla'
import { ArchivoError, leerArchivo } from '@/lib/consolidado/leer'

export const dynamic = 'force-dynamic'

// POST /api/consolidado/leer (multipart: file) — identifica el reporte
// (posiciones, movimientos o cupones; Pershing o Morgan Stanley) y lo devuelve
// normalizado. El armado del consolidado se hace en la pantalla.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: `${file.name}: tiene que ser un Excel (.xlsx) exportado del banco.` }, { status: 400 })

  let grilla: unknown[][]
  try {
    grilla = grillaDeExcel(Buffer.from(await file.arrayBuffer()))
  } catch {
    return NextResponse.json({ error: `${file.name}: no se pudo leer. ¿Es un Excel válido?` }, { status: 400 })
  }
  try {
    return NextResponse.json({ archivo: leerArchivo(grilla, file.name) })
  } catch (e) {
    if (e instanceof ArchivoError) return NextResponse.json({ error: `${file.name}: ${e.message}` }, { status: 400 })
    console.error('[consolidado/leer]', e)
    return NextResponse.json({ error: `${file.name}: error leyendo el reporte` }, { status: 500 })
  }
}
