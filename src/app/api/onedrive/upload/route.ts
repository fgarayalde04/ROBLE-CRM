import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGraphToken, uploadFile } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const folderId = formData.get('folderId') as string | null
    const driveId  = formData.get('driveId')  as string | null

    if (!file)     return NextResponse.json({ error: 'No se recibió archivo' },  { status: 400 })
    if (!folderId) return NextResponse.json({ error: 'folderId requerido' },     { status: 400 })
    if (!driveId)  return NextResponse.json({ error: 'driveId requerido' },      { status: 400 })

    const content  = await file.arrayBuffer()
    const mimeType = file.type || 'application/octet-stream'

    const token = await getGraphToken()
    const item  = await uploadFile(driveId, folderId, file.name, content, mimeType, token)

    // Audit log (best-effort — don't fail upload if log fails)
    ;(async () => {
      try {
        await supabaseAdmin.from('document_activity').insert({
          user_id:   session.id,
          action:    'upload',
          item_id:   item.id,
          item_name: item.name,
          item_type: 'file',
          folder_id: folderId,
          drive_id:  driveId,
          details:   { size: file.size, mimeType },
        })
      } catch (e) {
        console.warn('[upload audit]', e)
      }
    })()

    return NextResponse.json({ item })
  } catch (err: any) {
    console.error('[onedrive/upload]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
