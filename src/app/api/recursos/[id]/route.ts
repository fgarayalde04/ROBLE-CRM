import { NextRequest, NextResponse } from 'next/server'
import { getResource, updateResource, deleteResource } from '@/lib/db/resources'
import { deleteObject } from '@/lib/storage/s3'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    const allowed = ['name', 'category', 'description', 'company', 'responsible', 'tags', 'is_featured']
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    for (const key of allowed) {
      if (key in body) {
        update[key] = body[key]
      }
    }

    const data = await updateResource(id, update)
    if (!data) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const resource = await getResource(id)
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    // Extract the storage key from our download-redirect URL
    const match = (resource.file_url as string).match(/[?&]key=([^&]+)/)
    if (match) {
      const key = decodeURIComponent(match[1])
      try {
        await deleteObject(key)
      } catch { /* best-effort — still remove the DB record */ }
    }

    await deleteResource(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
