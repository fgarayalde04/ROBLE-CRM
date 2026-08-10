import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreateBrokerTable, listBrokerTables, fetchBrokerRows, addMonthColumn,
  addBrokerRow, createBrokerYear, upsertBrokerValue, updateBrokerRow, deleteBrokerRow,
} from '@/lib/db/liquidacionBrokers'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    if (searchParams.get('all') === '1') {
      const tables = await listBrokerTables()
      const results = []
      for (const table of tables) {
        const { rows, months } = await fetchBrokerRows(table.id)
        results.push({ table, rows, months })
      }
      return NextResponse.json(results)
    }

    const advisor = searchParams.get('advisor') ?? 'FRAN JJ'
    const company = searchParams.get('company') ?? 'roble'
    const year = parseInt(searchParams.get('year') ?? '2026')

    const table = await getOrCreateBrokerTable(advisor, company, year)
    const { rows, months } = await fetchBrokerRows(table.id)

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
      const result = await addMonthColumn(table_id, month)
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'add-row') {
      const { table_id, concept, is_formula, formula_type } = body as {
        table_id: string
        concept: string
        is_formula?: boolean
        formula_type?: string
      }
      const newRow = await addBrokerRow(table_id, concept, is_formula ?? false, formula_type ?? null)
      return NextResponse.json({ row: newRow })
    }

    if (action === 'create-year') {
      const { advisor, company, target_year, source_year } = body as {
        advisor: string
        company: string
        target_year: number
        source_year?: number
      }
      const result = await createBrokerYear(advisor, company, target_year, source_year)
      return NextResponse.json({ ok: true, table: result.table })
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
      await upsertBrokerValue(row_id, month, raw_value)
      return NextResponse.json({ ok: true })
    }

    if (action === 'update-row') {
      const { row_id, concept, sort_order } = body as { row_id: string; concept?: string; sort_order?: number }
      await updateBrokerRow(row_id, { concept, sort_order })
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
    await deleteBrokerRow(row_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
