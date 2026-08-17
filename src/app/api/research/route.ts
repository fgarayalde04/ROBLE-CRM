import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { listPosts, createPost, type ResearchType } from '@/lib/db/research'
import { uploadObject } from '@/lib/storage/s3'

const MANUAL_TYPES: ResearchType[] = [
  'noticia_mercado', 'bono', 'fondo', 'nueva_emision', 'research', 'macro', 'regulacion', 'novedad_interna',
]

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as ResearchType | null
    const category = searchParams.get('category') ?? undefined
    const q = searchParams.get('q') ?? undefined
    const featured = searchParams.get('featured') === 'true'

    // The feed excludes morning_brief entries — those have their own history view.
    const types = type ? [type] : MANUAL_TYPES

    const posts = await listPosts({ types, category, q, featured, userId: session.id, limit: 100 })
    return NextResponse.json({ posts })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'No tenés permiso para publicar en Research & Novedades' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const type = formData.get('type') as ResearchType
    const title = formData.get('title') as string

    if (!type || !MANUAL_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Tipo de publicación inválido' }, { status: 400 })
    }
    if (!title) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })

    const record: Record<string, any> = {
      type,
      title,
      category: (formData.get('category') as string) || null,
      summary: (formData.get('summary') as string) || null,
      body: (formData.get('body') as string) || null,
      link_url: (formData.get('link_url') as string) || null,
      author: (formData.get('author') as string) || session.name,
      issuer: (formData.get('issuer') as string) || null,
      isin: (formData.get('isin') as string) || null,
      currency: (formData.get('currency') as string) || null,
      coupon: (formData.get('coupon') as string) || null,
      maturity: (formData.get('maturity') as string) || null,
      yield_value: (formData.get('yield_value') as string) || null,
      fund_class: (formData.get('fund_class') as string) || null,
      factsheet_url: (formData.get('factsheet_url') as string) || null,
      termsheet_url: (formData.get('termsheet_url') as string) || null,
      internal_notes: (formData.get('internal_notes') as string) || null,
      pinned: formData.get('pinned') === 'true',
      featured: formData.get('featured') === 'true',
      created_by: session.id,
      created_by_name: session.name,
    }

    const publishedAt = formData.get('published_at') as string | null
    if (publishedAt) record.published_at = publishedAt

    const file = formData.get('file') as File | null
    if (file && file.size > 0) {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const key = `research/${timestamp}_${safeName}`
      const buffer = Buffer.from(await file.arrayBuffer())
      await uploadObject(key, buffer, file.type || 'application/octet-stream')
      record.file_url = `/api/research/download?key=${encodeURIComponent(key)}`
      record.file_name = file.name
    }

    const post = await createPost(record)
    return NextResponse.json({ post }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
