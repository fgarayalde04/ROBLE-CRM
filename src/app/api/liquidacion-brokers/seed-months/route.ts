import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Config ───────────────────────────────────────────────────────────────────

// All advisor+company combinations that exist in the system
const ADVISOR_COMPANIES = [
  { advisor: 'FRAN JJ',           company: 'roble'   },
  { advisor: 'Sandra',            company: 'geliene' },
  { advisor: 'Sandra',            company: 'roble'   },
  { advisor: 'Javier',            company: 'geliene' },
  { advisor: 'Javier',            company: 'roble'   },
  { advisor: 'Inés',              company: 'roble'   },
  { advisor: 'Guillermo',         company: 'geliene' },
  { advisor: 'Guillermo',         company: 'roble'   },
  { advisor: 'Francisco',         company: 'roble'   },
  { advisor: 'Federico-Fernando', company: 'roble'   },
]

// Months to initialize (add/extend as needed)
const MONTHS_TO_SEED = [
  'ene-26', 'feb-26', 'mar-26', 'abr-26', 'may-26',
  'jun-26', 'jul-26', 'ago-26', 'set-26', 'oct-26', 'nov-26', 'dic-26',
]

const YEAR = 2026

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const summary: {
      advisor: string
      company: string
      months_added: string[]
      months_skipped: string[]
      status: 'ok' | 'no_rows' | 'error'
      error?: string
    }[] = []

    for (const { advisor, company } of ADVISOR_COMPANIES) {
      // Find the table for this advisor+company+year
      const { data: tableRecord } = await supabaseAdmin
        .from('broker_settlement_tables')
        .select('id')
        .eq('advisor_name', advisor)
        .eq('company', company)
        .eq('year', YEAR)
        .single()

      if (!tableRecord) {
        summary.push({ advisor, company, months_added: [], months_skipped: [], status: 'no_rows', error: 'Table not found' })
        continue
      }

      const tableId = tableRecord.id

      // Get all rows for this table
      const { data: rows } = await supabaseAdmin
        .from('broker_settlement_rows')
        .select('id')
        .eq('table_id', tableId)

      if (!rows || rows.length === 0) {
        summary.push({ advisor, company, months_added: [], months_skipped: [], status: 'no_rows', error: 'No rows found — run seed first' })
        continue
      }

      const rowIds = rows.map((r: { id: string }) => r.id)

      // Get all existing month entries for these rows
      const { data: existingValues } = await supabaseAdmin
        .from('broker_settlement_values')
        .select('month')
        .in('row_id', rowIds)

      const existingMonths = new Set((existingValues ?? []).map((v: { month: string }) => v.month))

      const monthsAdded: string[] = []
      const monthsSkipped: string[] = []

      for (const month of MONTHS_TO_SEED) {
        if (existingMonths.has(month)) {
          monthsSkipped.push(month)
          continue
        }

        // Insert null placeholder for every row so the column appears
        const toInsert = rowIds.map((id: string) => ({
          row_id: id,
          month,
          value: null,
          raw_value: null,
        }))

        const { error: insertError } = await supabaseAdmin
          .from('broker_settlement_values')
          .insert(toInsert)

        if (insertError) {
          summary.push({
            advisor, company,
            months_added: monthsAdded,
            months_skipped: monthsSkipped,
            status: 'error',
            error: insertError.message,
          })
          break
        }

        monthsAdded.push(month)
      }

      summary.push({ advisor, company, months_added: monthsAdded, months_skipped: monthsSkipped, status: 'ok' })
    }

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
