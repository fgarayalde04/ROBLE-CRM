import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Clears all entered values (sets value + raw_value to null) but keeps the
// month placeholders so the columns still appear in the table.

export async function POST() {
  try {
    const { error, data } = await supabaseAdmin
      .from('broker_settlement_values')
      .update({ value: null, raw_value: null })
      .not('row_id', 'is', null)     // matches all rows
      .select('id')

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, cleared: data?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
