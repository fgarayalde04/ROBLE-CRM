import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const DEFAULT_EXCHANGE_RATE = 39.65

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawPaymentRow {
  id: string
  concept: string
  expense_type: string
  category: string
  comment: string | null
  sort_order: number
  monthly_payment_values: RawPaymentValue[]
}

interface RawPaymentValue {
  id: string
  month: string
  value: number | null
  raw_value: string | null
  payment_status: string | null
  paid_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRawValue(raw: string): { value: number | null; raw_value: string } {
  if (!raw || raw.trim() === '' || raw.trim() === '?') {
    return { value: null, raw_value: raw.trim() || '' }
  }
  const n = parseFloat(raw.replace(',', '.'))
  if (isNaN(n)) {
    return { value: null, raw_value: raw.trim() }
  }
  return { value: n, raw_value: raw.trim() }
}

async function getOrCreateTable(company: string, year: number) {
  // Try to fetch existing
  const { data: existing } = await supabaseAdmin
    .from('monthly_payment_tables')
    .select('*')
    .eq('company', company)
    .eq('year', year)
    .single()

  if (existing) return existing

  // Create new
  const { data: created, error } = await supabaseAdmin
    .from('monthly_payment_tables')
    .insert({ company, year, exchange_rate: DEFAULT_EXCHANGE_RATE })
    .select()
    .single()

  if (error) throw new Error(`Failed to create table: ${error.message}`)
  return created
}

async function fetchTableWithRows(tableId: string) {
  const { data: rows, error } = await supabaseAdmin
    .from('monthly_payment_rows')
    .select(`
      id, concept, expense_type, category, comment, sort_order,
      monthly_payment_values (id, month, value, raw_value, payment_status, paid_at)
    `)
    .eq('table_id', tableId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to fetch rows: ${error.message}`)

  return (rows as RawPaymentRow[] | null ?? []).map((row) => {
    const valuesMap: Record<string, { id?: string; value: number | null; raw_value: string | null; payment_status?: string | null; paid_at?: string | null }> = {}
    for (const v of row.monthly_payment_values ?? []) {
      valuesMap[v.month] = { id: v.id, value: v.value, raw_value: v.raw_value, payment_status: v.payment_status ?? undefined, paid_at: v.paid_at }
    }
    return {
      id: row.id,
      concept: row.concept,
      expense_type: row.expense_type,
      category: row.category,
      comment: row.comment,
      sort_order: row.sort_order,
      values: valuesMap,
    }
  })
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all')

  try {
    // ?all=1 — return all tables with rows+values
    if (all === '1') {
      const { data: tables, error } = await supabaseAdmin
        .from('monthly_payment_tables')
        .select('*')
        .order('year', { ascending: true })

      if (error) throw new Error(error.message)

      const result = await Promise.all(
        (tables ?? []).map(async (table) => {
          const rows = await fetchTableWithRows(table.id)
          return { table, rows }
        })
      )
      return NextResponse.json(result)
    }

    // ?company=X&year=Y
    const company = searchParams.get('company')
    const yearStr = searchParams.get('year')

    if (!company || !yearStr) {
      return NextResponse.json({ error: 'company and year required' }, { status: 400 })
    }

    const year = parseInt(yearStr, 10)
    const table = await getOrCreateTable(company, year)
    const rows = await fetchTableWithRows(table.id)

    return NextResponse.json({ table, rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'create-year') {
      const { company, year, from_year } = body as {
        company: string
        year: number
        from_year?: number
      }

      // Create the table (will error if already exists due to UNIQUE constraint)
      const { data: newTable, error } = await supabaseAdmin
        .from('monthly_payment_tables')
        .insert({ company, year, exchange_rate: DEFAULT_EXCHANGE_RATE })
        .select()
        .single()

      if (error) throw new Error(error.message)

      // Copy rows from from_year if provided
      if (from_year) {
        const { data: sourceTable } = await supabaseAdmin
          .from('monthly_payment_tables')
          .select('id')
          .eq('company', company)
          .eq('year', from_year)
          .single()

        if (sourceTable) {
          const { data: sourceRows } = await supabaseAdmin
            .from('monthly_payment_rows')
            .select('concept, expense_type, category, comment, sort_order')
            .eq('table_id', sourceTable.id)
            .order('sort_order', { ascending: true })

          if (sourceRows && sourceRows.length > 0) {
            const newRows = sourceRows.map((r) => ({
              table_id: newTable.id,
              concept: r.concept,
              expense_type: r.expense_type,
              category: r.category,
              comment: r.comment,
              sort_order: r.sort_order,
            }))
            await supabaseAdmin.from('monthly_payment_rows').insert(newRows)
          }
        }
      }

      return NextResponse.json(newTable)
    }

    if (action === 'add-row') {
      const { table_id, concept, expense_type, category } = body as {
        table_id: string
        concept: string
        expense_type: string
        category: string
      }

      // Get max sort_order
      const { data: existing } = await supabaseAdmin
        .from('monthly_payment_rows')
        .select('sort_order')
        .eq('table_id', table_id)
        .order('sort_order', { ascending: false })
        .limit(1)

      const maxOrder = existing && existing.length > 0 ? existing[0].sort_order : -1

      const { data: newRow, error } = await supabaseAdmin
        .from('monthly_payment_rows')
        .insert({
          table_id,
          concept,
          expense_type,
          category,
          sort_order: maxOrder + 1,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(newRow)
    }

    if (action === 'copy-month') {
      const { table_id, source_month, target_month, copy_values } = body as {
        table_id: string
        source_month: string
        target_month: string
        copy_values: boolean
      }

      const { data: sourceRows } = await supabaseAdmin
        .from('monthly_payment_rows')
        .select('id')
        .eq('table_id', table_id)

      if (!sourceRows || sourceRows.length === 0) {
        return NextResponse.json({ ok: true, rows_copied: 0 })
      }

      let rowsCopied = 0
      for (const row of sourceRows) {
        let valueToUpsert: number | null = null
        let rawValueToUpsert: string | null = null

        if (copy_values) {
          const { data: srcVal } = await supabaseAdmin
            .from('monthly_payment_values')
            .select('value, raw_value')
            .eq('row_id', row.id)
            .eq('month', source_month)
            .single()

          if (srcVal) {
            valueToUpsert = srcVal.value
            rawValueToUpsert = srcVal.raw_value
          }
        }

        const { error } = await supabaseAdmin
          .from('monthly_payment_values')
          .upsert(
            {
              row_id: row.id,
              month: target_month,
              value: valueToUpsert,
              raw_value: rawValueToUpsert,
              payment_status: 'pendiente',
              paid_at: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'row_id,month', ignoreDuplicates: true }
          )

        if (!error) rowsCopied++
      }

      return NextResponse.json({ ok: true, rows_copied: rowsCopied })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'exchange-rate') {
      const { table_id, exchange_rate } = body as { table_id: string; exchange_rate: number }
      const { data, error } = await supabaseAdmin
        .from('monthly_payment_tables')
        .update({ exchange_rate, updated_at: new Date().toISOString() })
        .eq('id', table_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (action === 'upsert-value') {
      const { row_id, month, raw_value } = body as {
        row_id: string
        month: string
        raw_value: string
      }

      const parsed = parseRawValue(raw_value)

      const { data, error } = await supabaseAdmin
        .from('monthly_payment_values')
        .upsert(
          {
            row_id,
            month,
            value: parsed.value,
            raw_value: parsed.raw_value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'row_id,month' }
        )
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (action === 'update-row') {
      const { row_id, ...rest } = body as {
        row_id: string
        concept?: string
        expense_type?: string
        category?: string
        comment?: string
        sort_order?: number
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (rest.concept !== undefined) updates.concept = rest.concept
      if (rest.expense_type !== undefined) updates.expense_type = rest.expense_type
      if (rest.category !== undefined) updates.category = rest.category
      if (rest.comment !== undefined) updates.comment = rest.comment
      if (rest.sort_order !== undefined) updates.sort_order = rest.sort_order

      const { data, error } = await supabaseAdmin
        .from('monthly_payment_rows')
        .update(updates)
        .eq('id', row_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (action === 'toggle-payment') {
      const { row_id, month, payment_status } = body as {
        row_id: string
        month: string
        payment_status: 'pendiente' | 'pagado'
      }

      const { data, error } = await supabaseAdmin
        .from('monthly_payment_values')
        .upsert(
          {
            row_id,
            month,
            payment_status,
            paid_at: payment_status === 'pagado' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'row_id,month' }
        )
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (action === 'reset-month') {
      // Reset ALL payment_status to 'pendiente' for a given month across all tables
      const { month } = body as { month: string }
      const { error } = await supabaseAdmin
        .from('monthly_payment_values')
        .update({ payment_status: 'pendiente', paid_at: null, updated_at: new Date().toISOString() })
        .eq('month', month)
        .neq('payment_status', 'pendiente')
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, month })
    }

    if (action === 'toggle-closed-month') {
      const { table_id, month } = body as { table_id: string; month: string }

      const { data: tableRow, error: fetchError } = await supabaseAdmin
        .from('monthly_payment_tables')
        .select('closed_months')
        .eq('id', table_id)
        .single()

      if (fetchError) throw new Error(fetchError.message)

      const currentClosed: string[] = tableRow?.closed_months ?? []
      const newClosed = currentClosed.includes(month)
        ? currentClosed.filter((m: string) => m !== month)
        : [...currentClosed, month]

      const { data, error } = await supabaseAdmin
        .from('monthly_payment_tables')
        .update({ closed_months: newClosed, updated_at: new Date().toISOString() })
        .eq('id', table_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'delete-row') {
      const { row_id } = body as { row_id: string }
      const { error } = await supabaseAdmin
        .from('monthly_payment_rows')
        .delete()
        .eq('id', row_id)

      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
