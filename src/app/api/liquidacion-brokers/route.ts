import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Month sorting ────────────────────────────────────────────────────────────

const MONTH_ORDER: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
}

function sortMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const [ma, ya] = a.split('-')
    const [mb, yb] = b.split('-')
    const yearA = parseInt(ya ?? '0'), yearB = parseInt(yb ?? '0')
    if (yearA !== yearB) return yearA - yearB
    return (MONTH_ORDER[ma] ?? 0) - (MONTH_ORDER[mb] ?? 0)
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerRow {
  id: string
  concept: string
  sort_order: number
  is_formula: boolean
  formula_type: string | null
  values: Record<string, { id?: string; value: number | null; raw_value: string | null }>
}

interface BrokerTable {
  id: string
  advisor_name: string
  company: string
  year: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateTable(advisor: string, company: string, year: number): Promise<BrokerTable> {
  const { data: existing } = await supabaseAdmin
    .from('broker_settlement_tables')
    .select('*')
    .eq('advisor_name', advisor)
    .eq('company', company)
    .eq('year', year)
    .single()

  if (existing) return existing as BrokerTable

  const { data: created, error } = await supabaseAdmin
    .from('broker_settlement_tables')
    .insert({ advisor_name: advisor, company, year })
    .select('*')
    .single()

  if (error || !created) throw new Error(`Failed to create table: ${error?.message}`)
  return created as BrokerTable
}

async function fetchRows(tableId: string): Promise<{ rows: BrokerRow[]; months: string[] }> {
  const { data: rawRows, error: rowsError } = await supabaseAdmin
    .from('broker_settlement_rows')
    .select('*')
    .eq('table_id', tableId)
    .order('sort_order', { ascending: true })

  if (rowsError) throw new Error(`Failed to fetch rows: ${rowsError.message}`)
  if (!rawRows || rawRows.length === 0) return { rows: [], months: [] }

  const rowIds = rawRows.map((r: { id: string }) => r.id)

  const { data: rawValues, error: valuesError } = await supabaseAdmin
    .from('broker_settlement_values')
    .select('*')
    .in('row_id', rowIds)

  if (valuesError) throw new Error(`Failed to fetch values: ${valuesError.message}`)

  const allMonths = new Set<string>()
  const valuesByRow: Record<string, Record<string, { id?: string; value: number | null; raw_value: string | null }>> = {}

  for (const v of (rawValues ?? [])) {
    if (!valuesByRow[v.row_id]) valuesByRow[v.row_id] = {}
    valuesByRow[v.row_id][v.month] = { id: v.id, value: v.value, raw_value: v.raw_value }
    allMonths.add(v.month)
  }

  const rows: BrokerRow[] = rawRows.map((r: {
    id: string
    concept: string
    sort_order: number
    is_formula: boolean
    formula_type: string | null
  }) => ({
    id: r.id,
    concept: r.concept,
    sort_order: r.sort_order,
    is_formula: r.is_formula,
    formula_type: r.formula_type,
    values: valuesByRow[r.id] ?? {},
  }))

  const months = sortMonths(Array.from(allMonths))

  return { rows, months }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    if (searchParams.get('all') === '1') {
      const { data: tables } = await supabaseAdmin
        .from('broker_settlement_tables')
        .select('*')
        .order('created_at', { ascending: false })

      const results = []
      for (const table of (tables ?? [])) {
        const { rows, months } = await fetchRows(table.id)
        results.push({ table, rows, months })
      }
      return NextResponse.json(results)
    }

    const advisor = searchParams.get('advisor') ?? 'FRAN JJ'
    const company = searchParams.get('company') ?? 'roble'
    const year = parseInt(searchParams.get('year') ?? '2026')

    const table = await getOrCreateTable(advisor, company, year)
    const { rows, months } = await fetchRows(table.id)

    return NextResponse.json({ table, rows, months })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const body = await req.json()

    if (action === 'add-month') {
      const { table_id, month } = body as { table_id: string; month: string }

      // Get all rows for this table
      const { data: existingRows } = await supabaseAdmin
        .from('broker_settlement_rows')
        .select('id')
        .eq('table_id', table_id)

      if (!existingRows || existingRows.length === 0) {
        return NextResponse.json({ ok: true, noop: true })
      }

      const rowIds = existingRows.map((r: { id: string }) => r.id)

      // Check if month already has any values
      const { data: existingValues } = await supabaseAdmin
        .from('broker_settlement_values')
        .select('id')
        .in('row_id', rowIds)
        .eq('month', month)
        .limit(1)

      if (existingValues && existingValues.length > 0) {
        return NextResponse.json({ ok: true, noop: true })
      }

      // Insert null placeholder for every row in the table so the month column appears
      const toInsert = rowIds.map((id: string) => ({
        row_id: id,
        month,
        value: null,
        raw_value: null,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('broker_settlement_values')
        .insert(toInsert)

      if (insertError) throw new Error(insertError.message)
      return NextResponse.json({ ok: true, inserted: toInsert.length })
    }

    if (action === 'add-row') {
      const { table_id, concept, is_formula, formula_type } = body as {
        table_id: string
        concept: string
        is_formula?: boolean
        formula_type?: string
      }

      const { data: maxRow } = await supabaseAdmin
        .from('broker_settlement_rows')
        .select('sort_order')
        .eq('table_id', table_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      const nextOrder = maxRow ? (maxRow.sort_order + 1) : 0

      const { data: newRow, error } = await supabaseAdmin
        .from('broker_settlement_rows')
        .insert({
          table_id,
          concept,
          sort_order: nextOrder,
          is_formula: is_formula ?? false,
          formula_type: formula_type ?? null,
        })
        .select('*')
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json({ row: newRow })
    }

    if (action === 'create-year') {
      const { advisor, company, target_year, source_year } = body as {
        advisor: string
        company: string
        target_year: number
        source_year?: number
      }

      // Check if target already exists
      const { data: existing } = await supabaseAdmin
        .from('broker_settlement_tables')
        .select('id')
        .eq('advisor_name', advisor)
        .eq('company', company)
        .eq('year', target_year)
        .single()

      if (existing) return NextResponse.json({ ok: true, table: existing })

      // Create new table
      const { data: newTable, error: createError } = await supabaseAdmin
        .from('broker_settlement_tables')
        .insert({ advisor_name: advisor, company, year: target_year })
        .select('*')
        .single()

      if (createError || !newTable) throw new Error(createError?.message ?? 'Failed to create table')

      // If source_year provided, copy row structure (without values)
      if (source_year) {
        const { data: sourceTable } = await supabaseAdmin
          .from('broker_settlement_tables')
          .select('id')
          .eq('advisor_name', advisor)
          .eq('company', company)
          .eq('year', source_year)
          .single()

        if (sourceTable) {
          const { data: sourceRows } = await supabaseAdmin
            .from('broker_settlement_rows')
            .select('concept, sort_order, is_formula, formula_type')
            .eq('table_id', sourceTable.id)
            .order('sort_order')

          if (sourceRows && sourceRows.length > 0) {
            await supabaseAdmin
              .from('broker_settlement_rows')
              .insert(sourceRows.map((r: { concept: string; sort_order: number; is_formula: boolean; formula_type: string | null }) => ({
                ...r,
                table_id: newTable.id,
              })))
          }
        }
      }

      return NextResponse.json({ ok: true, table: newTable })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const body = await req.json()

    if (action === 'upsert-value') {
      const { row_id, month, raw_value } = body as { row_id: string; month: string; raw_value: string }

      const parsed = parseFloat(String(raw_value).replace(',', '.'))
      const numericValue = isNaN(parsed) ? null : parsed

      const { error } = await supabaseAdmin
        .from('broker_settlement_values')
        .upsert(
          { row_id, month, value: numericValue, raw_value, updated_at: new Date().toISOString() },
          { onConflict: 'row_id,month' }
        )

      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (action === 'update-row') {
      const { row_id, concept, sort_order } = body as { row_id: string; concept?: string; sort_order?: number }

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (concept !== undefined) update.concept = concept
      if (sort_order !== undefined) update.sort_order = sort_order

      const { error } = await supabaseAdmin
        .from('broker_settlement_rows')
        .update(update)
        .eq('id', row_id)

      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { row_id } = body as { row_id: string }

    const { error } = await supabaseAdmin
      .from('broker_settlement_rows')
      .delete()
      .eq('id', row_id)

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
