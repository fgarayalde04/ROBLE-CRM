import { NextRequest, NextResponse } from 'next/server'
import { listTaxRecords, addTaxRecord, seedTaxRecords, updateTaxRecord, toggleTaxStatus, deleteTaxRecord } from '@/lib/db/impuestos'

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const data = await listTaxRecords()
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'add') {
      const data = await addTaxRecord(body)
      return NextResponse.json(data)
    }

    if (action === 'seed') {
      const inserted = await seedTaxRecords()
      return NextResponse.json({ ok: true, inserted })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'update') {
      const { id, ...rest } = body as { id: string } & Record<string, any>
      const data = await updateTaxRecord(id, rest)
      return NextResponse.json(data)
    }

    if (action === 'toggle-status') {
      const { id, status } = body as { id: string; status: string }
      const data = await toggleTaxStatus(id, status)
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  try {
    const body = await req.json()

    if (action === 'delete') {
      const { id } = body as { id: string }
      await deleteTaxRecord(id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
