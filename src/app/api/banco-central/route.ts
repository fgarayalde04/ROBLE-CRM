import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const CHECKBOX_FIELDS = [
  'ficha',
  'lista_verificacion',
  'cuestionario',
  'ci',
  'cumplo',
  'documentos_legales',
] as const

type CheckboxField = (typeof CHECKBOX_FIELDS)[number]

// GET /api/banco-central?type=local|internacional
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')

  let query = supabaseAdmin
    .from('banco_central_records')
    .select('*')
    .order('customer_number', { ascending: true, nullsFirst: false })
    .order('folder_name', { ascending: true })

  if (type === 'local' || type === 'internacional') {
    query = query.eq('type', type)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
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

  // cerrar / reabrir account
  if (action === 'cerrar') {
    const { error } = await supabaseAdmin
      .from('banco_central_records')
      .update({ status: 'cerrada', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, newStatus: 'cerrada' })
  }

  if (action === 'reabrir') {
    // Recompute status from current checkbox values
    const { data: current } = await supabaseAdmin
      .from('banco_central_records')
      .select(CHECKBOX_FIELDS.join(','))
      .eq('id', id)
      .single()
    const row = current as unknown as Record<string, unknown>
    const allChecked = CHECKBOX_FIELDS.every((f) => row?.[f] === true)
    const { error } = await supabaseAdmin
      .from('banco_central_records')
      .update({ status: allChecked ? 'completo' : 'incompleto', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, newStatus: allChecked ? 'completo' : 'incompleto' })
  }

  if (!field) return NextResponse.json({ error: 'field requerido' }, { status: 400 })

  // free-text fields
  if (field === 'comentario' || field === 'fa') {
    const { error } = await supabaseAdmin
      .from('banco_central_records')
      .update({ [field]: value as string, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // checkbox fields
  if (!CHECKBOX_FIELDS.includes(field as CheckboxField)) {
    return NextResponse.json({ error: `Campo inválido: ${field}` }, { status: 400 })
  }
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'value debe ser boolean' }, { status: 400 })
  }

  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('banco_central_records')
    .select(CHECKBOX_FIELDS.join(','))
    .eq('id', id)
    .single()

  if (fetchErr || !current) return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })

  const row = current as unknown as Record<string, unknown>
  const merged = { ...row, [field]: value }
  const allChecked = CHECKBOX_FIELDS.every((f) => merged[f] === true)

  const { error } = await supabaseAdmin
    .from('banco_central_records')
    .update({ [field]: value, status: allChecked ? 'completo' : 'incompleto', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, newStatus: allChecked ? 'completo' : 'incompleto' })
}

// POST /api/banco-central — bulk restore checkboxes from localStorage backup
// Body: { records: [{ id, ficha, lista_verificacion, cuestionario, ci, cumplo, documentos_legales }] }
export async function POST(req: NextRequest) {
  type RestoreRecord = { id: string } & Record<CheckboxField, boolean>
  const body = await req.json() as { records?: RestoreRecord[] }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return NextResponse.json({ error: 'records requerido' }, { status: 400 })
  }

  let updated = 0
  const CHUNK = 50
  for (let i = 0; i < body.records.length; i += CHUNK) {
    const batch = body.records.slice(i, i + CHUNK)
    await Promise.all(
      batch.map(async (rec) => {
        const checkboxes: Partial<Record<CheckboxField, boolean>> = {}
        for (const f of CHECKBOX_FIELDS) {
          if (typeof rec[f] === 'boolean') checkboxes[f] = rec[f]
        }
        const allChecked = CHECKBOX_FIELDS.every((f) => checkboxes[f] === true)
        const { error } = await supabaseAdmin
          .from('banco_central_records')
          .update({ ...checkboxes, status: allChecked ? 'completo' : 'incompleto', updated_at: new Date().toISOString() })
          .eq('id', rec.id)
        if (!error) updated++
      }),
    )
  }

  return NextResponse.json({ ok: true, updated })
}
