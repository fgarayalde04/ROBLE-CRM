import { NextResponse } from 'next/server'
import { listScoringFiles } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q        = searchParams.get('q')?.trim() ?? ''
    const clientId = searchParams.get('client_id') ?? ''

    const data = await listScoringFiles(q, clientId)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
