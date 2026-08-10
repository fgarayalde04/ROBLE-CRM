import { NextResponse } from 'next/server'
import { updateOpeningChecklistItem } from '@/lib/db/openings'

export async function PUT(req: Request) {
  try {
    const { id, completed, responsible, note } = await req.json()
    const data = await updateOpeningChecklistItem(id, { completed, responsible, note })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
