import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { logDocumentActivity } from '@/lib/db/activityLog'
import { getGraphToken, getPreviewUrl } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const driveId  = searchParams.get('driveId')
    const itemName = searchParams.get('name') ?? undefined

    if (!driveId) return NextResponse.json({ error: 'driveId requerido' }, { status: 400 })

    const token      = await getGraphToken()
    const previewUrl = await getPreviewUrl(driveId, params.id, token)

    // Audit view
    await logDocumentActivity({
      user_id:   session.id,
      action:    'view',
      item_id:   params.id,
      item_name: itemName ?? null,
      item_type: 'file',
      folder_id: null,
      drive_id:  driveId,
      details:   {},
    })

    return NextResponse.json({ previewUrl })
  } catch (err: any) {
    console.error('[onedrive/preview]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
