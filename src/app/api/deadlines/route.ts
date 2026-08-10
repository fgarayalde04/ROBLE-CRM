import { NextResponse } from 'next/server'
import { createDeadline, updateDeadline, deleteDeadline } from '@/lib/db/deadlines'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const data = await createDeadline(payload)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { id, ...payload } = await req.json()
    const data = await updateDeadline(id, payload)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    await deleteDeadline(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
