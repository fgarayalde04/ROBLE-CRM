import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getPost, updatePost, markRead } from '@/lib/db/research'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const post = await getPost(params.id, session.id)
  if (!post) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await markRead(params.id, session.id)
  return NextResponse.json({ post: { ...post, read: true } })
}

const EDITABLE_FIELDS = [
  'title', 'category', 'summary', 'body', 'link_url', 'author',
  'issuer', 'isin', 'currency', 'coupon', 'maturity', 'yield_value', 'fund_class',
  'factsheet_url', 'termsheet_url', 'internal_notes',
]
const ADMIN_ONLY_FIELDS = ['pinned', 'featured', 'archived']

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'No tenés permiso para editar publicaciones' }, { status: 403 })
  }

  const body = await request.json()
  const updates: Record<string, any> = {}
  for (const key of [...EDITABLE_FIELDS, ...ADMIN_ONLY_FIELDS]) {
    if (key in body) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const post = await updatePost(params.id, updates)
  if (!post) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ post })
}
