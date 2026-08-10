import { NextRequest, NextResponse } from 'next/server'
import { listComments, createComment, deleteComment } from '@/lib/db/comments'

export async function GET(req: NextRequest) {
  const entity_type = req.nextUrl.searchParams.get('entity_type') ?? ''
  const entity_id = req.nextUrl.searchParams.get('entity_id') ?? ''

  try {
    const data = await listComments(entity_type, entity_id)
    return NextResponse.json(data ?? [])
  } catch (error: any) {
    // Table may not exist yet — return empty gracefully
    if (error.code === '42P01') return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { entity_type, entity_id, author, content } = body

    if (!entity_type || !author || !content) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const data = await createComment({ entity_type, entity_id: entity_id ?? null, author, content })
    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  try {
    await deleteComment(id)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Error interno' }, { status: 500 })
  }
}
