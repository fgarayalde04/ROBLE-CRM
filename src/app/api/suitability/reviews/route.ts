import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('client_id')
    const advisor  = searchParams.get('advisor')
    const limit    = parseInt(searchParams.get('limit') ?? '200', 10)

    let query = supabaseAdmin
      .from('portfolio_reviews')
      .select(`
        id, client_id, client_name, client_profile,
        uploaded_by, file_name, advisor,
        portfolio_score, portfolio_profile, classified_weight, pending_weight,
        explanation, notes, created_at,
        crm_users!uploaded_by ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (clientId) query = query.eq('client_id', clientId)
    if (advisor)  query = query.ilike('advisor', `%${advisor}%`)

    const { data, error } = await query
    if (error) throw error

    const reviews = data ?? []

    // Enrich with client_number from clients table
    const clientIds = reviews.map((r: any) => r.client_id).filter(Boolean) as string[]
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

    const extractAccountFromFile = (fileName: string): string | null => {
      const m = fileName.match(/_([A-Z0-9]{6,12})(?:\.[^.]+)?$/i)
      return m ? m[1].toUpperCase() : null
    }

    const enriched = reviews.map((r: any) => ({
      ...r,
      client_number: r.client_id
        ? (clientNumberMap[r.client_id] ?? extractAccountFromFile(r.file_name ?? ''))
        : extractAccountFromFile(r.file_name ?? ''),
    }))

    return NextResponse.json(enriched)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('portfolio_reviews')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
