import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('tax_records')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('company', { ascending: true })
      .order('tax_name', { ascending: true })

    if (error) throw new Error(error.message)
    return NextResponse.json(data ?? [])
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'add') {
      const { tax_name, company, official_link, due_date, comment } = body as {
        tax_name: string
        company: string
        official_link?: string
        due_date?: string
        comment?: string
      }

      const { data: maxData } = await supabaseAdmin
        .from('tax_records')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)

      const maxOrder = maxData && maxData.length > 0 ? maxData[0].sort_order : -1

      const { data, error } = await supabaseAdmin
        .from('tax_records')
        .insert({
          tax_name,
          company,
          official_link: official_link ?? null,
          due_date: due_date ?? null,
          comment: comment ?? null,
          status: 'pendiente',
          sort_order: maxOrder + 1,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (action === 'seed') {
      const seeds = [
        { tax_name: 'BPS', company: 'roble', official_link: 'https://servicios.bps.gub.uy', comment: 'Mensual' },
        { tax_name: 'DGI', company: 'roble', official_link: 'https://www.dgi.gub.uy', comment: 'Mensual' },
        { tax_name: 'BPS IRPF', company: 'roble', official_link: 'https://servicios.bps.gub.uy', comment: null },
        { tax_name: 'BPS', company: 'geliene', official_link: 'https://servicios.bps.gub.uy', comment: null },
        { tax_name: 'DGI', company: 'geliene', official_link: 'https://www.dgi.gub.uy', comment: null },
        { tax_name: 'BPS IRPF', company: 'geliene', official_link: 'https://servicios.bps.gub.uy', comment: null },
      ]

      let inserted = 0
      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i]
        const { data: existing } = await supabaseAdmin
          .from('tax_records')
          .select('id')
          .eq('tax_name', seed.tax_name)
          .eq('company', seed.company)
          .limit(1)

        if (existing && existing.length > 0) continue

        await supabaseAdmin.from('tax_records').insert({
          ...seed,
          status: 'pendiente',
          sort_order: i,
        })
        inserted++
      }

      return NextResponse.json({ ok: true, inserted })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'update') {
      const { id, ...rest } = body as {
        id: string
        tax_name?: string
        company?: string
        official_link?: string
        due_date?: string
        status?: string
        comment?: string
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (rest.tax_name !== undefined) updates.tax_name = rest.tax_name
      if (rest.company !== undefined) updates.company = rest.company
      if (rest.official_link !== undefined) updates.official_link = rest.official_link
      if (rest.due_date !== undefined) updates.due_date = rest.due_date
      if (rest.status !== undefined) updates.status = rest.status
      if (rest.comment !== undefined) updates.comment = rest.comment

      const { data, error } = await supabaseAdmin
        .from('tax_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (action === 'toggle-status') {
      const { id, status } = body as { id: string; status: string }

      const { data, error } = await supabaseAdmin
        .from('tax_records')
        .update({
          status,
          paid_at: status === 'pagado' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'delete') {
      const { id } = body as { id: string }
      const { error } = await supabaseAdmin
        .from('tax_records')
        .delete()
        .eq('id', id)

      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
