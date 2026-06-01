import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGraphToken, searchInFolder } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q        = (searchParams.get('q') ?? '').trim()
    const driveId  = searchParams.get('driveId')
    const folderId = searchParams.get('folderId')

    if (!q)        return NextResponse.json({ items: [] })
    if (!driveId)  return NextResponse.json({ error: 'driveId requerido' }, { status: 400 })
    if (!folderId) return NextResponse.json({ error: 'folderId requerido' }, { status: 400 })

    const token = await getGraphToken()
    const items = await searchInFolder(driveId, folderId, q, token)

    return NextResponse.json({ items })
  } catch (err: any) {
    console.error('[onedrive/search]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
