import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { grillaDeExcel } from '@/lib/consolidado/grilla'
import { ArchivoError, leerArchivo } from '@/lib/consolidado/leer'
import { parsePerformancePdf, type PeriodReturns } from '@/lib/portfolio/performancePdfParser'
import type { ArchivoRendimiento, Periodos } from '@/lib/consolidado/types'

const periodos = (p: PeriodReturns | null): Periodos | null => p && {
  ytd: p.ytd, unAnio: p.oneYear, tresAnios: p.threeYear, cincoAnios: p.fiveYear, desdeInicio: p.sinceInception,
}

/** PDF de performance (Pershing o Morgan Stanley): solo los números, sin datos de la cuenta. */
async function leerRendimiento(buffer: Buffer, nombre: string): Promise<ArchivoRendimiento> {
  const r = await parsePerformancePdf(buffer)
  if (!r.reportDate && r.returns.ytd == null && r.returns.sinceInception == null) {
    throw new ArchivoError('no se reconoce como un reporte de performance de Pershing o Morgan Stanley.')
  }
  return {
    tipo: 'rendimiento',
    banco: r.custodian === 'morgan' ? 'Morgan Stanley' : 'Pershing',
    nombre,
    fecha: r.periodEnd ?? r.reportDate,
    cuentas: [],
    periodoDesde: r.periodStart,
    periodoHasta: r.periodEnd,
    inicio: r.inceptionDate,
    valorFinal: r.endingValue,
    rentabilidad: periodos(r.returns)!,
    cambioValor: periodos(r.changeInValue),
    aportesNetos: periodos(r.netContribution),
    avisos: r.warnings,
  }
}

export const dynamic = 'force-dynamic'

// POST /api/consolidado/leer (multipart: file) — identifica el reporte
// (posiciones, movimientos, cupones o el PDF de performance; Pershing o
// Morgan Stanley) y lo devuelve
// normalizado. El armado del consolidado se hace en la pantalla.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'factsheet', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (/\.pdf$/i.test(file.name)) {
    try {
      return NextResponse.json({ archivo: await leerRendimiento(Buffer.from(await file.arrayBuffer()), file.name) })
    } catch (e) {
      if (e instanceof ArchivoError) return NextResponse.json({ error: `${file.name}: ${e.message}` }, { status: 400 })
      console.error('[consolidado/leer pdf]', e)
      return NextResponse.json({ error: `${file.name}: no se pudo leer el PDF de performance` }, { status: 400 })
    }
  }
  if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ error: `${file.name}: tiene que ser un Excel (.xlsx) exportado del banco o el PDF de performance.` }, { status: 400 })

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
