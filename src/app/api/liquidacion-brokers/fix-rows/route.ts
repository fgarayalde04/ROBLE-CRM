import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// ─── Fixes to apply ───────────────────────────────────────────────────────────
// These correct structural mismatches between the seed and the Excel templates.

interface Fix {
  advisor: string
  company: string
  year: number
  match_concept: string        // find row by this concept name
  new_concept: string          // rename to this
  new_sort_order: number       // and set this sort_order
}

const FIXES: Fix[] = [
  // Javier GELIENE: "Acuerdo / Premio" must be AFTER Sub Total (sort 25, not 17)
  {
    advisor: 'Javier', company: 'geliene', year: 2026,
    match_concept: 'Acuerdo / Premio',
    new_concept: 'Acuerdo 2022 / Premio',
    new_sort_order: 25,
  },
  // Sandra GELIENE: same fix
  {
    advisor: 'Sandra', company: 'geliene', year: 2026,
    match_concept: 'Acuerdo / Premio',
    new_concept: 'Acuerdo 2022 / Premio',
    new_sort_order: 25,
  },
]

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const results: { advisor: string; company: string; status: string; detail?: string }[] = []

    for (const fix of FIXES) {
      // Find the table
      const { rows: tableRows } = await pool.query(
        `select id from broker_settlement_tables where advisor_name = $1 and company = $2 and year = $3`,
        [fix.advisor, fix.company, fix.year]
      )
      const table = tableRows[0]

      if (!table) {
        results.push({ advisor: fix.advisor, company: fix.company, status: 'skipped', detail: 'Table not found' })
        continue
      }

      // Find the row to fix
      const { rows: rowRows } = await pool.query(
        `select id, sort_order, concept from broker_settlement_rows where table_id = $1 and concept = $2`,
        [table.id, fix.match_concept]
      )
      const row = rowRows[0]

      if (!row) {
        // Try with new concept name already (idempotent)
        const { rows: fixedRows } = await pool.query(
          `select id, sort_order from broker_settlement_rows where table_id = $1 and concept = $2`,
          [table.id, fix.new_concept]
        )
        const alreadyFixed = fixedRows[0]

        if (alreadyFixed && alreadyFixed.sort_order === fix.new_sort_order) {
          results.push({ advisor: fix.advisor, company: fix.company, status: 'already_correct' })
        } else {
          results.push({ advisor: fix.advisor, company: fix.company, status: 'skipped', detail: 'Row not found' })
        }
        continue
      }

      // Apply the fix
      try {
        await pool.query(
          `update broker_settlement_rows set concept = $1, sort_order = $2 where id = $3`,
          [fix.new_concept, fix.new_sort_order, row.id]
        )
        results.push({
          advisor: fix.advisor,
          company: fix.company,
          status: 'fixed',
          detail: `"${fix.match_concept}" (sort ${row.sort_order}) → "${fix.new_concept}" (sort ${fix.new_sort_order})`,
        })
      } catch (e: any) {
        results.push({ advisor: fix.advisor, company: fix.company, status: 'error', detail: e.message })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
