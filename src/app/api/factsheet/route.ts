import { NextResponse } from 'next/server'
import { listFactsheets, createFactsheet, deleteFactsheet } from '@/lib/db/factsheets'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clientName = searchParams.get('client') ?? ''

    const data = await listFactsheets(clientName)
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()

    const data = await createFactsheet({
      client_name:   body.meta?.clientName ?? '',
      report_date:   body.meta?.reportDate ?? new Date().toISOString().split('T')[0],
      quarter:       body.meta?.quarter    ?? '',
      advisor:       body.meta?.advisor    ?? session.email ?? '',
      benchmark:     body.meta?.benchmark  ?? '',
      total_value:   body.totalValue       ?? 0,
      risk_score:    body.riskScore        ?? null,
      risk_profile:  body.riskProfile      ?? '',
      data:          body,
      created_by:    session.id,
    })

    return NextResponse.json({ id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    await deleteFactsheet(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
