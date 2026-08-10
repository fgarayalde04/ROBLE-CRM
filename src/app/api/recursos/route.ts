import { NextRequest, NextResponse } from 'next/server'
import { listResources, createResource } from '@/lib/db/resources'
import { uploadObject } from '@/lib/storage/s3'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') ?? undefined
    const q = searchParams.get('q') ?? undefined
    const featured = searchParams.get('featured') === 'true'

    const data = await listResources({ category, q, featured })
    return NextResponse.json(data)
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

    // Upload file to S3-compatible storage
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const key = `recursos/${timestamp}_${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    try {
      await uploadObject(key, buffer, file.type || 'application/pdf')
    } catch (uploadError: any) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const fileUrl = `/api/recursos/download?key=${encodeURIComponent(key)}`

    // Save metadata to DB
    const data = await createResource({
      name,
      category,
      description: description || null,
      company: company || null,
      responsible: responsible || null,
      tags,
      is_featured: isFeatured,
      file_url: fileUrl,
      file_name: file.name,
      file_size: file.size,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
