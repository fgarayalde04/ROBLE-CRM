import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listPersonalFiles, createPersonalFile, renamePersonalFile, getPersonalFile, deletePersonalFile } from '@/lib/db/personalFiles'
import { uploadObject, deleteObject } from '@/lib/storage/s3'

export const dynamic = 'force-dynamic'

// GET — list files for current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const files = await listPersonalFiles(session.id)
    return NextResponse.json({ files })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
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
  const key = `personal-files/${session.id}/${Date.now()}_${safeName}`

  try {
    await uploadObject(key, buffer, file.type || 'application/octet-stream')
  } catch (uploadError: any) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const fileUrl = `/api/personal-files/download?key=${encodeURIComponent(key)}`

  try {
    const record = await createPersonalFile({
      user_id:   session.id,
      user_email: session.email ?? '',
      file_name: file.name,
      file_url:  fileUrl,
      file_type: file.type,
      file_size: file.size,
      notes,
    })
    return NextResponse.json({ file: record }, { status: 201 })
  } catch (dbError: any) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
}

// PATCH — rename file
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id, file_name } = await req.json()
  if (!id || !file_name?.trim()) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  try {
    const data = await renamePersonalFile(id, session.id, file_name.trim())
    if (!data) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    return NextResponse.json({ file: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — remove file by id
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const record = await getPersonalFile(id, session.id)
  if (!record) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

  // Extract the storage key from our download-redirect URL
  const match = (record.file_url as string).match(/[?&]key=([^&]+)/)
  if (match) {
    const key = decodeURIComponent(match[1])
    try {
      await deleteObject(key)
    } catch { /* best-effort — still remove the DB record */ }
  }

  try {
    await deletePersonalFile(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
