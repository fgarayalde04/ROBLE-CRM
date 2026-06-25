import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface ImportRow {
  tipo_activo: string
  nombre: string
  isin?: string
  cusip?: string
  ticker?: string
  moneda?: string
  emisor?: string
  categoria?: string
}

// POST /api/instruments/import
// Body: { rows: ImportRow[] }
// Upserts: if ISIN or CUSIP already exists → update; otherwise → insert
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { rows } = await req.json() as { rows: ImportRow[] }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No se recibieron filas' }, { status: 400 })
  }

  const VALID_TIPOS = new Set(['fondo', 'bono', 'accion'])
  const TIPO_ALIASES: Record<string, string> = {
    fondos: 'fondo', bonds: 'bono', bonos: 'bono', bond: 'bono', fund: 'fondo',
    acciones: 'accion', acción: 'accion', actions: 'accion', equities: 'accion', equity: 'accion',
  }

  let inserted = 0
  let updated  = 0
  let skipped  = 0
  const errors: string[] = []

  for (const raw of rows) {
    if (!raw.nombre?.trim()) { skipped++; continue }

    const rawTipo = (raw.tipo_activo ?? '').toLowerCase().trim()
    const tipo    = VALID_TIPOS.has(rawTipo) ? rawTipo : (TIPO_ALIASES[rawTipo] ?? null)

    if (!tipo) {
      errors.push(`Fila ignorada — tipo_activo inválido: "${raw.tipo_activo}" (nombre: ${raw.nombre})`)
      skipped++
      continue
    }

    const record = {
      tipo_activo: tipo as 'fondo' | 'bono' | 'accion',
      nombre:      raw.nombre.trim(),
      isin:        raw.isin?.trim()      || null,
      cusip:       raw.cusip?.trim()     || null,
      ticker:      raw.ticker?.trim()    || null,
      moneda:      raw.moneda?.trim()    || 'USD',
      emisor:      raw.emisor?.trim()    || null,
      categoria:   raw.categoria?.trim() || null,
      activo:      true,
    }

    try {
      // Try upsert by ISIN first, then CUSIP, then insert
      if (record.isin) {
        const { data: existing } = await supabaseAdmin
          .from('instrument_master').select('id').eq('isin', record.isin).maybeSingle()

        if (existing) {
          await supabaseAdmin.from('instrument_master').update(record).eq('id', existing.id)
          updated++; continue
        }
      }
      if (record.cusip) {
        const { data: existing } = await supabaseAdmin
          .from('instrument_master').select('id').eq('cusip', record.cusip).maybeSingle()

        if (existing) {
          await supabaseAdmin.from('instrument_master').update(record).eq('id', existing.id)
          updated++; continue
        }
      }

      await supabaseAdmin.from('instrument_master').insert(record)
      inserted++
    } catch (e: any) {
      errors.push(`Error en "${record.nombre}": ${e.message}`)
      skipped++
    }
  }

  return NextResponse.json({ inserted, updated, skipped, errors })
}
