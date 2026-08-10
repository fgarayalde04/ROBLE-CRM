import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

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
      const { rows: tableRows } = await pool.query(
        `select id from broker_settlement_tables where advisor_name = $1 and company = $2 and year = $3`,
        [advisor, company, YEAR]
      )
      const tableRecord = tableRows[0]

      if (!tableRecord) {
        summary.push({ advisor, company, months_added: [], months_skipped: [], status: 'no_rows', error: 'Table not found' })
        continue
      }

      const tableId = tableRecord.id

      // Get all rows for this table
      const { rows } = await pool.query(`select id from broker_settlement_rows where table_id = $1`, [tableId])

      if (!rows || rows.length === 0) {
        summary.push({ advisor, company, months_added: [], months_skipped: [], status: 'no_rows', error: 'No rows found — run seed first' })
        continue
      }

      const rowIds = rows.map((r: { id: string }) => r.id)

      // Get all existing month entries for these rows
      const { rows: existingValues } = await pool.query(
        `select month from broker_settlement_values where row_id = ANY($1)`,
        [rowIds]
      )

      const existingMonths = new Set((existingValues ?? []).map((v: { month: string }) => v.month))

      const monthsAdded: string[] = []
      const monthsSkipped: string[] = []

      for (const month of MONTHS_TO_SEED) {
        if (existingMonths.has(month)) {
          monthsSkipped.push(month)
          continue
        }

        // Insert null placeholder for every row so the column appears
        try {
          const values: any[] = []
          const placeholders = rowIds.map((id: string, i: number) => {
            values.push(id, month)
            return `($${i * 2 + 1}, $${i * 2 + 2}, null, null)`
          })
          await pool.query(
            `insert into broker_settlement_values (row_id, month, value, raw_value) values ${placeholders.join(', ')}`,
            values
          )
        } catch (e: any) {
          summary.push({
            advisor, company,
            months_added: monthsAdded,
            months_skipped: monthsSkipped,
            status: 'error',
            error: e.message,
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
