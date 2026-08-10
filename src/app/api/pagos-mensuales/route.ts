import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreatePaymentTable, listPaymentTables, fetchPaymentTableRows, createPaymentYear,
  addPaymentRow, copyPaymentMonth, updateExchangeRate, upsertPaymentValue, updatePaymentRow,
  togglePaymentStatus, resetMonthPaymentStatus, toggleClosedMonth, deletePaymentRow,
} from '@/lib/db/pagosMensuales'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all')

  try {
    if (all === '1') {
      const tables = await listPaymentTables()
      const result = await Promise.all(
        tables.map(async (table) => ({ table, rows: await fetchPaymentTableRows(table.id) }))
      )
      return NextResponse.json(result)
    }

    const company = searchParams.get('company')
    const yearStr = searchParams.get('year')

    if (!company || !yearStr) {
      return NextResponse.json({ error: 'company and year required' }, { status: 400 })
    }

    const year = parseInt(yearStr, 10)
    const table = await getOrCreatePaymentTable(company, year)
    const rows = await fetchPaymentTableRows(table.id)

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
      const { company, year, from_year } = body as { company: string; year: number; from_year?: number }
      const newTable = await createPaymentYear(company, year, from_year)
      return NextResponse.json(newTable)
    }

    if (action === 'add-row') {
      const { table_id, concept, expense_type, category } = body as {
        table_id: string; concept: string; expense_type: string; category: string
      }
      const newRow = await addPaymentRow(table_id, concept, expense_type, category)
      return NextResponse.json(newRow)
    }

    if (action === 'copy-month') {
      const { table_id, source_month, target_month, copy_values } = body as {
        table_id: string; source_month: string; target_month: string; copy_values: boolean
      }
      const rowsCopied = await copyPaymentMonth(table_id, source_month, target_month, copy_values)
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
      const data = await updateExchangeRate(table_id, exchange_rate)
      return NextResponse.json(data)
    }

    if (action === 'upsert-value') {
      const { row_id, month, raw_value } = body as { row_id: string; month: string; raw_value: string }
      const data = await upsertPaymentValue(row_id, month, raw_value)
      return NextResponse.json(data)
    }

    if (action === 'update-row') {
      const { row_id, ...rest } = body as {
        row_id: string; concept?: string; expense_type?: string; category?: string; comment?: string; sort_order?: number
      }
      const data = await updatePaymentRow(row_id, rest)
      return NextResponse.json(data)
    }

    if (action === 'toggle-payment') {
      const { row_id, month, payment_status } = body as { row_id: string; month: string; payment_status: 'pendiente' | 'pagado' }
      const data = await togglePaymentStatus(row_id, month, payment_status)
      return NextResponse.json(data)
    }

    if (action === 'reset-month') {
      const { month } = body as { month: string }
      await resetMonthPaymentStatus(month)
      return NextResponse.json({ ok: true, month })
    }

    if (action === 'toggle-closed-month') {
      const { table_id, month } = body as { table_id: string; month: string }
      const data = await toggleClosedMonth(table_id, month)
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
      await deletePaymentRow(row_id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
