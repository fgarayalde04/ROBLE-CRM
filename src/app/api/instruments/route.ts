import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
  const q     = searchParams.get('q')?.trim()
  const tipo  = searchParams.get('tipo')  // 'fondo' | 'bono' | 'accion'
  const all   = searchParams.get('all') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 200)

  let query = supabaseAdmin
    .from('instrument_master')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(all ? 500 : limit)

  if (tipo) query = query.eq('tipo_activo', tipo)

  if (q) {
    // Search by name (ilike), ISIN, or CUSIP
    query = query.or(
      `nombre.ilike.%${q}%,isin.ilike.%${q}%,cusip.ilike.%${q}%,ticker.ilike.%${q}%,emisor.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ instruments: data ?? [] })
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

  const { data, error } = await supabaseAdmin
    .from('instrument_master')
    .insert(record)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un instrumento con ese ISIN o CUSIP' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}
