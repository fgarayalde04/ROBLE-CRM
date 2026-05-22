import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET — list files for current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('personal_files')
    .select('*')
    .eq('user_id', session.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data })
}

// POST — upload file (multipart/form-data)
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const notes = (formData.get('notes') as string | null) ?? null

  if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const safeName = file.name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // remove accents
    .replace(/[^a-zA-Z0-9._-]/g, '_')                  // replace special chars with _
    .replace(/_+/g, '_')                                // collapse multiple underscores
  const storagePath = `${session.id}/${Date.now()}_${safeName}`

  // Ensure bucket exists (creates it if missing)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  const bucketExists = buckets?.some((b) => b.name === 'personal-files')
  if (!bucketExists) {
    await supabaseAdmin.storage.createBucket('personal-files', { public: false })
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from('personal-files')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Signed URL valid for 10 years (private bucket)
  const { data: urlData } = await supabaseAdmin.storage
    .from('personal-files')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

  const fileUrl = urlData?.signedUrl ?? storagePath

  const { data: record, error: dbError } = await supabaseAdmin
    .from('personal_files')
    .insert({
      user_id:   session.id,
      user_email: session.email ?? '',
      file_name: file.name,
      file_url:  fileUrl,
      file_type: file.type,
      file_size: file.size,
      notes,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ file: record }, { status: 201 })
}

// PATCH — rename file
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id, file_name } = await req.json()
  if (!id || !file_name?.trim()) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('personal_files')
    .update({ file_name: file_name.trim() })
    .eq('id', id)
    .eq('user_id', session.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ file: data })
}

// DELETE — remove file by id
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  // Fetch record to verify ownership and get storage path
  const { data: record, error: fetchError } = await supabaseAdmin
    .from('personal_files')
    .select('*')
    .eq('id', id)
    .eq('user_id', session.id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!record) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

  // Derive storage path from URL
  const url = record.file_url as string
  const bucketPrefix = '/personal-files/'
  const idx = url.indexOf(bucketPrefix)
  if (idx !== -1) {
    const storagePath = url.slice(idx + bucketPrefix.length)
    await supabaseAdmin.storage.from('personal-files').remove([storagePath])
  }

  const { error: dbError } = await supabaseAdmin
    .from('personal_files')
    .delete()
    .eq('id', id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
