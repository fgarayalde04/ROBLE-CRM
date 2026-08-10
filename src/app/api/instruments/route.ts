import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { searchInstruments, createInstrument } from '@/lib/db/instruments'

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
    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un instrumento con ese ISIN o CUSIP' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
