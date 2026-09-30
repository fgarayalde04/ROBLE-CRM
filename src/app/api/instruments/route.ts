import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { searchInstruments, createInstrument, ensureRiskClassified, reclassifyInstrumentsSafe } from '@/lib/db/instruments'
import type { RiskGroup, RiskFuente } from '@/lib/riskGroups'
import { hayAccionesPendientes, startYahooSectores } from '@/lib/riskYahoo'

export const dynamic = 'force-dynamic'

export interface Instrument {
  id: string
  tipo_activo: 'fondo' | 'bono' | 'accion'
  nombre: string
  isin: string | null
  cusip: string | null
  ticker: string | null
  moneda: string | null
  emisor: string | null
  categoria: string | null
  activo: boolean
  maturity_date?: string | null
  coupon?: number | null
  rating?: string | null
  frequency?: string | null
  day_count_convention?: string | null
  riesgo_grupo?: RiskGroup | null
  riesgo_puntaje?: number | null
  riesgo_fuente?: RiskFuente | null
  riesgo_revisar?: boolean
  riesgo_motivo?: string | null
  riesgo_updated_by?: string | null
  sector?: string | null
  industria?: string | null
  pais?: string | null
  created_at: string
  updated_at: string
}

// GET /api/instruments?q=blackrock&tipo=fondo&limit=10&all=true
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q     = searchParams.get('q')?.trim() ?? null
  const tipo  = searchParams.get('tipo')
  const all   = searchParams.get('all') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 200)

  await ensureRiskClassified()
  // Acciones sin sector/país: se buscan una vez en Yahoo, en segundo plano.
  hayAccionesPendientes().then((p) => { if (p) startYahooSectores() }).catch(() => {})
  const data = await searchInstruments(q, tipo, limit, all)
  return NextResponse.json({ instruments: data })
}

// POST /api/instruments — create instrument
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { tipo_activo, nombre, isin, cusip, ticker, moneda, emisor, categoria } = body

  if (!tipo_activo || !nombre) {
    return NextResponse.json({ error: 'tipo_activo y nombre son requeridos' }, { status: 400 })
  }

  const record = {
    tipo_activo,
    nombre:    nombre.trim(),
    isin:      isin?.trim()    || null,
    cusip:     cusip?.trim()   || null,
    ticker:    ticker?.trim()  || null,
    moneda:    moneda?.trim()  || 'USD',
    emisor:    emisor?.trim()  || null,
    categoria: categoria?.trim() || null,
    activo:    true,
  }

  try {
    const data = await createInstrument(record)
    await reclassifyInstrumentsSafe([data.id])
    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un instrumento con ese ISIN o CUSIP' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
