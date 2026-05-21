import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data, error } = await supabaseAdmin.rpc('increment_resource_views', { resource_id: id })

    if (error) {
      // Fallback: manual increment if RPC doesn't exist
      const { data: current, error: fetchErr } = await supabaseAdmin
        .from('resources')
        .select('view_count')
        .eq('id', id)
        .single()

      if (fetchErr || !current) {
        return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('resources')
        .update({ view_count: (current.view_count ?? 0) + 1 })
        .eq('id', id)
        .select('view_count')
        .single()

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      return NextResponse.json({ view_count: updated.view_count })
    }

    return NextResponse.json({ view_count: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
