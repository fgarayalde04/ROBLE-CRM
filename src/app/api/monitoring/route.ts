import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

// GET /api/monitoring?entity=roble|geliene
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity') ?? 'roble'

  const { data, error } = await supabaseAdmin
    .from('monitoring_runs')
    .select('*')
    .eq('entity', entity)
    .order('period_year', { ascending: false })
    .order('period_quarter', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}
