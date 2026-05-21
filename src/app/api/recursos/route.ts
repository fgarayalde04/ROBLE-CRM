import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const q = searchParams.get('q')
    const featured = searchParams.get('featured')

    let query = supabaseAdmin
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false })

    if (category) {
      query = query.eq('category', category)
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true)
    }

    if (q) {
      query = query.or(
        `name.ilike.%${q}%,description.ilike.%${q}%,company.ilike.%${q}%`
      )
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const name = formData.get('name') as string
    const category = formData.get('category') as string

    if (!name || !category) {
      return NextResponse.json({ error: 'name and category are required' }, { status: 400 })
    }

    const description = formData.get('description') as string | null
    const company = formData.get('company') as string | null
    const responsible = formData.get('responsible') as string | null
    const tagsRaw = formData.get('tags') as string | null
    const isFeatured = formData.get('is_featured') === 'true'

    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : []

    // Upload file to Supabase Storage
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${timestamp}_${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('recursos')
      .upload(filePath, buffer, { contentType: 'application/pdf', upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from('recursos').getPublicUrl(filePath)

    // Save metadata to DB
    const { data, error } = await supabaseAdmin.from('resources').insert({
      name,
      category,
      description: description || null,
      company: company || null,
      responsible: responsible || null,
      tags,
      is_featured: isFeatured,
      file_url: publicUrl,
      file_name: file.name,
      file_size: file.size,
    }).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
