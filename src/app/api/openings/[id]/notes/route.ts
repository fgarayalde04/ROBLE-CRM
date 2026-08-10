import { NextResponse } from 'next/server'
import { getOpeningNotes, createOpeningNote, updateOpeningNote } from '@/lib/db/openings'

export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    const data = await getOpeningNotes(context.params.id)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const body = await req.json()
    const data = await createOpeningNote(context.params.id, body.text, body.author ?? null)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request, context: { params: { id: string } }) {
  try {
    const { id, ...updates } = await req.json()
    const data = await updateOpeningNote(context.params.id, id, updates)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
