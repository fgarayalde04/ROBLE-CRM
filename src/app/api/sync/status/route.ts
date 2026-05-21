import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch last 50 logs then deduplicate per sync_type in JS
  // (avoids needing a raw rpc call for DISTINCT ON)
  const { data, error } = await supabaseAdmin
    .from('sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  const seen = new Set<string>()
  const latest: typeof rows = []

  for (const row of rows) {
    if (!seen.has(row.sync_type)) {
      seen.add(row.sync_type)
      latest.push(row)
    }
  }

  return NextResponse.json(latest)
}
