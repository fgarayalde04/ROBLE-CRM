import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSession } from '@/lib/auth'
import { uploadObject, getSignedDownloadUrl } from '@/lib/storage/s3'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024
const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

// POST (multipart, campo "file") → { key } de la imagen subida
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  const ext = TIPOS[file.type]
  if (!ext) return NextResponse.json({ error: 'Formato no soportado (usá PNG, JPG o WEBP)' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen supera los 10 MB' }, { status: 400 })
  const key = `plantillas/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`
  try {
    await uploadObject(key, Buffer.from(await file.arrayBuffer()), file.type)
  } catch (err: any) {
    console.error('[plantillas/imagen] upload', err.message)
    return NextResponse.json({ error: 'No se pudo guardar la imagen' }, { status: 500 })
  }
  return NextResponse.json({ key })
}

// GET ?key=plantillas/... → redirige a una URL firmada de la imagen
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!/^plantillas\/[\w\-/.]+$/.test(key) || key.includes('..')) {
    return NextResponse.json({ error: 'Imagen inválida' }, { status: 400 })
  }
  try {
    const url = await getSignedDownloadUrl(key, 60 * 60)
    return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, max-age=3000' } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
