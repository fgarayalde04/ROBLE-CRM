import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const entity_type = req.nextUrl.searchParams.get('entity_type') ?? ''
  const entity_id = req.nextUrl.searchParams.get('entity_id') ?? ''

  try {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .order('created_at', { ascending: true })

    if (error) {
      // Table may not exist yet — return empty gracefully
      if (error.code === '42P01') {
        return NextResponse.json([])
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { entity_type, entity_id, author, content } = body

    if (!entity_type || !author || !content) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('comments')
      .insert({ entity_type, entity_id: entity_id ?? null, author, content })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin.from('comments').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
