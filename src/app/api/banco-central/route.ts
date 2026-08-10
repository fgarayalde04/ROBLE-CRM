import { NextRequest, NextResponse } from 'next/server'
import {
  CHECKBOX_FIELDS, type CheckboxField,
  listBancoCentralRecords, closeBancoCentralRecord, reopenBancoCentralRecord,
  updateBancoCentralText, updateBancoCentralCheckbox, bulkRestoreBancoCentralCheckboxes,
} from '@/lib/db/bancoCentral'

// GET /api/banco-central?type=local|internacional
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const data = await listBancoCentralRecords(type)
  return NextResponse.json({ records: data })
}

// PUT /api/banco-central
// Body: { id, field, value }
//   checkbox fields: value = boolean
//   comentario:      value = string
//   action: 'cerrar' | 'reabrir'
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, field, value, action } = body as { id: string; field?: string; value?: unknown; action?: string }

  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  if (action === 'cerrar') {
    await closeBancoCentralRecord(id)
    return NextResponse.json({ ok: true, newStatus: 'cerrada' })
  }

  if (action === 'reabrir') {
    const newStatus = await reopenBancoCentralRecord(id)
    return NextResponse.json({ ok: true, newStatus })
  }

  if (!field) return NextResponse.json({ error: 'field requerido' }, { status: 400 })

  if (field === 'comentario' || field === 'fa') {
    await updateBancoCentralText(id, field, value as string)
    return NextResponse.json({ ok: true })
  }

  if (!CHECKBOX_FIELDS.includes(field as CheckboxField)) {
    return NextResponse.json({ error: `Campo inválido: ${field}` }, { status: 400 })
  }
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'value debe ser boolean' }, { status: 400 })
  }

  const newStatus = await updateBancoCentralCheckbox(id, field as CheckboxField, value)
  if (!newStatus) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, newStatus })
}

// POST /api/banco-central — bulk restore checkboxes from localStorage backup
export async function POST(req: NextRequest) {
  const body = await req.json() as { records?: any[] }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json({ error: 'records requerido' }, { status: 400 })
  }

  const updated = await bulkRestoreBancoCentralCheckboxes(body.records)
  return NextResponse.json({ ok: true, updated })
}
