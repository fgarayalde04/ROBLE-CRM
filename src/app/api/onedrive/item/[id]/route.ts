import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGraphToken, getDriveItem, deleteItem, renameItem, moveItem, getDownloadUrl } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'

// GET — fetch item metadata + download URL
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const driveId = searchParams.get('driveId')
    if (!driveId) return NextResponse.json({ error: 'driveId requerido' }, { status: 400 })

    const token = await getGraphToken()
    const [item, downloadUrl] = await Promise.all([
      getDriveItem(driveId, params.id, token),
      getDriveItem(driveId, params.id, token).then(() =>
        getDownloadUrl(driveId, params.id, token).catch(() => null)
      ),
    ])

    return NextResponse.json({ item, downloadUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH — rename or move
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body     = await req.json()
    const driveId  = body.driveId  as string
    const newName  = body.name     as string | undefined
    const parentId = body.parentId as string | undefined

    if (!driveId) return NextResponse.json({ error: 'driveId requerido' }, { status: 400 })

    const token  = await getGraphToken()
    let   item

    if (parentId) {
      item = await moveItem(driveId, params.id, parentId, token, newName)
      await supabaseAdmin.from('document_activity').insert({
        user_id:   session.id,
        action:    'move',
        item_id:   params.id,
        item_name: item.name,
        item_type: item.folder ? 'folder' : 'file',
        drive_id:  driveId,
        details:   { newParentId: parentId },
      })
    } else if (newName) {
      item = await renameItem(driveId, params.id, newName, token)
      await supabaseAdmin.from('document_activity').insert({
        user_id:   session.id,
        action:    'rename',
        item_id:   params.id,
        item_name: newName,
        item_type: item.folder ? 'folder' : 'file',
        drive_id:  driveId,
        details:   {},
      })
    } else {
      return NextResponse.json({ error: 'Debe especificar name o parentId' }, { status: 400 })
    }

    return NextResponse.json({ item })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const driveId  = searchParams.get('driveId')
    const itemName = searchParams.get('name') ?? undefined
    const itemType = searchParams.get('type') ?? undefined

    if (!driveId) return NextResponse.json({ error: 'driveId requerido' }, { status: 400 })

    const token = await getGraphToken()
    await deleteItem(driveId, params.id, token)

    await supabaseAdmin.from('document_activity').insert({
      user_id:   session.id,
      action:    'delete',
      item_id:   params.id,
      item_name: itemName ?? null,
      item_type: itemType ?? null,
      drive_id:  driveId,
      details:   {},
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
