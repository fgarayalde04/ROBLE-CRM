import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGraphToken, createFolder } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { parentId, driveId, name } = await req.json()

    if (!parentId) return NextResponse.json({ error: 'parentId requerido' }, { status: 400 })
    if (!driveId)  return NextResponse.json({ error: 'driveId requerido' },  { status: 400 })
    if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const token  = await getGraphToken()
    const folder = await createFolder(driveId, parentId, name.trim(), token)

    await supabaseAdmin.from('document_activity').insert({
      user_id:   session.id,
      action:    'mkdir',
      item_id:   folder.id,
      item_name: folder.name,
      item_type: 'folder',
      folder_id: parentId,
      drive_id:  driveId,
      details:   {},
    })

    return NextResponse.json({ item: folder })
  } catch (err: any) {
    console.error('[onedrive/mkdir]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
