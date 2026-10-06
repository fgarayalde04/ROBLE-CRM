import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { categoriasMonitor, filasMasOperado } from '@/lib/plantillas/datosAuto'
import { esFechaIso } from '@/lib/masOperado/periodos'

export const dynamic = 'force-dynamic'

// Datos automáticos para el editor de plantillas:
//   GET ?fuente=monitor                                        → fondos del Monitor por categoría
//   GET ?fuente=ordenes&tipo=mas_operado_fondos|bonos&desde&hasta&cantidad → más comprados / vendidos
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  try {
    if (sp.get('fuente') === 'monitor') return NextResponse.json({ categorias: await categoriasMonitor() })
    if (sp.get('fuente') === 'ordenes') {
      const tipo = sp.get('tipo')
      const desde = sp.get('desde')
      const hasta = sp.get('hasta')
      if (tipo !== 'mas_operado_fondos' && tipo !== 'mas_operado_bonos') return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
      if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
      return NextResponse.json(await filasMasOperado(tipo, desde, hasta, Number(sp.get('cantidad')) || 5))
    }
    return NextResponse.json({ error: 'Fuente inválida' }, { status: 400 })
  } catch (err: any) {
    console.error('[plantillas/fuentes]', err.message)
    return NextResponse.json({ error: 'No se pudieron traer los datos' }, { status: 500 })
  }
}
