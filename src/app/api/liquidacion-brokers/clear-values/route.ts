import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Clears all entered values (sets value + raw_value to null) but keeps the
// month placeholders so the columns still appear in the table.

export async function POST() {
  try {
    const { rows } = await pool.query(
      `update broker_settlement_values set value = null, raw_value = null where row_id is not null returning id`
    )

    return NextResponse.json({ ok: true, cleared: rows.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
