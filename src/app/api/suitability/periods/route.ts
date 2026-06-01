import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data, error } = await supabaseAdmin
      .from('scoring_periods')
      .select('*')
      .order('period_year',    { ascending: false })
      .order('period_quarter', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { period_year, period_quarter, notes } = await req.json()
    if (!period_year || !period_quarter) {
      return NextResponse.json({ error: 'period_year y period_quarter requeridos' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('scoring_periods')
      .insert({ period_year, period_quarter, notes: notes || null, created_by: session.id })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `Ya existe un scoring para Q${period_quarter} ${period_year}` }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
