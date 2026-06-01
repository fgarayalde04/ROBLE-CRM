import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const [{ data: period, error: pErr }, { data: reviews, error: rErr }] = await Promise.all([
      supabaseAdmin.from('scoring_periods').select('*').eq('id', params.id).single(),
      supabaseAdmin
        .from('portfolio_reviews')
        .select(`
          id, client_id, client_name, client_profile, advisor,
          portfolio_score, portfolio_profile, classified_weight, pending_weight,
          explanation, file_name, notes, created_at,
          crm_users!uploaded_by ( name )
        `)
        .eq('period_id', params.id)
        .order('client_name', { ascending: true, nullsFirst: false }),
    ])

    if (pErr) throw pErr
    if (rErr) throw rErr

    // Enrich with client_number from clients table
    const clientIds = (reviews ?? [])
      .map((r: any) => r.client_id)
      .filter(Boolean) as string[]

    let clientNumberMap: Record<string, string> = {}
    if (clientIds.length > 0) {
      const { data: clients } = await supabaseAdmin
        .from('clients')
        .select('id, client_number')
        .in('id', clientIds)
      for (const c of clients ?? []) {
        if (c.client_number) clientNumberMap[c.id] = c.client_number
      }
    }

    // Extract account number from file name as fallback
    // Pattern: Unrealized+Gain+Loss_ROJ902519.xlsx → ROJ902519
    const extractAccountFromFile = (fileName: string): string | null => {
      const m = fileName.match(/_([A-Z0-9]{6,12})(?:\.[^.]+)?$/i)
      return m ? m[1].toUpperCase() : null
    }

    const enrichedReviews = (reviews ?? []).map((r: any) => ({
      ...r,
      client_number: r.client_id
        ? (clientNumberMap[r.client_id] ?? extractAccountFromFile(r.file_name ?? ''))
        : extractAccountFromFile(r.file_name ?? ''),
    }))

    return NextResponse.json({ period, reviews: enrichedReviews })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const allowed: Record<string, unknown> = {}
    if (body.status !== undefined) allowed.status = body.status
    if (body.notes  !== undefined) allowed.notes  = body.notes

    const { data, error } = await supabaseAdmin
      .from('scoring_periods')
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

    // Detach reviews from period (don't delete them)
    await supabaseAdmin
      .from('portfolio_reviews')
      .update({ period_id: null })
      .eq('period_id', params.id)

    const { error } = await supabaseAdmin
      .from('scoring_periods')
      .delete()
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
