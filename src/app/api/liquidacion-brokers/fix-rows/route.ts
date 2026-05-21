import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
      const { data: table } = await supabaseAdmin
        .from('broker_settlement_tables')
        .select('id')
        .eq('advisor_name', fix.advisor)
        .eq('company', fix.company)
        .eq('year', fix.year)
        .single()

      if (!table) {
        results.push({ advisor: fix.advisor, company: fix.company, status: 'skipped', detail: 'Table not found' })
        continue
      }

      // Find the row to fix
      const { data: row } = await supabaseAdmin
        .from('broker_settlement_rows')
        .select('id, sort_order, concept')
        .eq('table_id', table.id)
        .eq('concept', fix.match_concept)
        .single()

      if (!row) {
        // Try with new concept name already (idempotent)
        const { data: alreadyFixed } = await supabaseAdmin
          .from('broker_settlement_rows')
          .select('id, sort_order')
          .eq('table_id', table.id)
          .eq('concept', fix.new_concept)
          .single()

        if (alreadyFixed && alreadyFixed.sort_order === fix.new_sort_order) {
          results.push({ advisor: fix.advisor, company: fix.company, status: 'already_correct' })
        } else {
          results.push({ advisor: fix.advisor, company: fix.company, status: 'skipped', detail: 'Row not found' })
        }
        continue
      }

      // Apply the fix
      const { error } = await supabaseAdmin
        .from('broker_settlement_rows')
        .update({ concept: fix.new_concept, sort_order: fix.new_sort_order })
        .eq('id', row.id)

      if (error) {
        results.push({ advisor: fix.advisor, company: fix.company, status: 'error', detail: error.message })
      } else {
        results.push({
          advisor: fix.advisor,
          company: fix.company,
          status: 'fixed',
          detail: `"${fix.match_concept}" (sort ${row.sort_order}) → "${fix.new_concept}" (sort ${fix.new_sort_order})`,
        })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
