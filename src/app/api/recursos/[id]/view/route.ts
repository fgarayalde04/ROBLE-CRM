import { NextRequest, NextResponse } from 'next/server'
import { incrementResourceViews } from '@/lib/db/resources'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const view_count = await incrementResourceViews(id)
    if (view_count === null) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    return NextResponse.json({ view_count })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
