import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q        = searchParams.get('q')?.trim() ?? ''
    const clientId = searchParams.get('client_id') ?? ''

    let query = supabaseAdmin
      .from('scoring_files')
      .select('id, name, client_folder, client_id, drive_id, item_id, web_url, file_size, mime_type, last_modified, last_synced_at')
      .order('last_modified', { ascending: false, nullsFirst: false })
      .limit(200)

    if (clientId) {
      query = query.eq('client_id', clientId)
    } else if (q) {
      query = query.or(`name.ilike.%${q}%,client_folder.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
