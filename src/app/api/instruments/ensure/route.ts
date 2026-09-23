import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ensureInstrument } from '@/lib/db/instruments'

// POST /api/instruments/ensure — guarda en el maestro un fondo/bono cargado a
// mano (si no estaba), para que aparezca la próxima vez en el buscador.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  if ((body.tipo_activo !== 'fondo' && body.tipo_activo !== 'bono') || !body.nombre || !body.identificador) {
    return NextResponse.json({ error: 'tipo_activo, nombre e identificador son requeridos' }, { status: 400 })
  }
  try {
    const result = await ensureInstrument({
      tipo_activo: body.tipo_activo,
      nombre: String(body.nombre),
      identificador: String(body.identificador),
      moneda: body.moneda ?? null,
      emisor: body.emisor ?? null,
      categoria: body.categoria ?? null,
      maturity_date: body.maturity_date ?? null,
      coupon: body.coupon != null ? Number(body.coupon) : null,
      rating: body.rating ?? null,
      frequency: body.frequency ?? null,
      day_count_convention: body.day_count_convention ?? null,
    })
    return NextResponse.json({ saved: result !== null, ...(result ?? {}) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
