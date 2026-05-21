import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

    const { data, error } = await supabaseAdmin
      .from('resources')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

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

    // Get the resource to find the file path
    const { data: resource, error: fetchError } = await supabaseAdmin
      .from('resources')
      .select('file_url, file_name')
      .eq('id', id)
      .single()

    if (fetchError || !resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    // Extract the storage path from the public URL
    // public URL format: .../storage/v1/object/public/recursos/FILEPATH
    const urlParts = resource.file_url.split('/recursos/')
    if (urlParts.length > 1) {
      const storagePath = urlParts[1]
      await supabaseAdmin.storage.from('recursos').remove([storagePath])
    }

    // Delete from DB
    const { error: deleteError } = await supabaseAdmin
      .from('resources')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
