import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getBlotterRows } from '@/lib/db/ordenes'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

export interface BlotterRow {
  id: string
  order_id: string
  order_type: string
  operation_type: string
  instrument_name: string | null
  symbol: string | null
  cusip: string | null
  quantity: string | null
  price: string | null
  moneda: string | null
  vigencia: string | null
  order_date: string | null
  notes: string | null
  cupon: string | null
  maturity: string | null
  mail_respondido: boolean
  mail_respondido_at: string | null
  mail_respondido_by: string | null
  done: boolean
  precio_ejecutado: number | null
  valor_efectivo: number | null
  ejecutado_at: string | null
  ejecutado_by: string | null
  en_mercado_at: string | null
  en_mercado_by: string | null
  cancelado_at: string | null
  cancelado_by: string | null
  cancelado_motivo: string | null
  estado: string
  item_created_at: string
  orden_id: string
  user_name: string | null
  user_id: string | null
  client_name: string | null
  client_number: string | null
  order_created_at: string
}

// GET /api/ordenes/blotter
// Params: dateFrom, dateTo, asesor, estado, tipo, operacion, q, vigencia
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const sp = req.nextUrl.searchParams

  const dateFrom  = sp.get('dateFrom')
  const dateTo    = sp.get('dateTo')
  const asesor    = isAdmin ? sp.get('asesor') : null
  const estado    = sp.get('estado')
  const tipo      = sp.get('tipo')
  const operacion = sp.get('operacion')
  const vigencia  = sp.get('vigencia')
  const q         = sp.get('q')?.trim()
  const soloHoy   = sp.get('hoy') === '1'

  const { rows, kpis } = await getBlotterRows({
    userFilter: !isAdmin ? session.name : null,
    asesor, dateFrom, dateTo, q, soloHoy, estado, tipo, operacion, vigencia,
  })

  return NextResponse.json({ rows, isAdmin, kpis })
}
