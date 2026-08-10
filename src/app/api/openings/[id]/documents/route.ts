import { NextResponse } from 'next/server'
import { getOpeningDocuments, createOpeningDocument, updateOpeningDocument } from '@/lib/db/openings'

export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    const data = await getOpeningDocuments(context.params.id)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const body = await req.json()
    const data = await createOpeningDocument(context.params.id, body)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request, context: { params: { id: string } }) {
  try {
    const { id, ...updates } = await req.json()
    const data = await updateOpeningDocument(context.params.id, id, updates)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
