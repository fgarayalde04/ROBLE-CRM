import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type DocState = 'falta' | 'pedido' | 'recibido' | 'revisado' | 'vencido'

const COMPLIANCE_FIELDS = ['ficha_cliente', 'perfil_inversor', 'cedula', 'documentos_legales', 'cuestionario_asesor'] as const
type ComplianceField = typeof COMPLIANCE_FIELDS[number]

const DONE_STATES: DocState[] = ['recibido', 'revisado']

function computeStatus(record: Record<string, string>): 'completo' | 'incompleto' {
  const allDone = COMPLIANCE_FIELDS.every((f) => DONE_STATES.includes(record[f] as DocState))
  return allDone ? 'completo' : 'incompleto'
}

const DEFAULT_COMPLIANCE = {
  id: null,
  ficha_cliente: 'falta',
  perfil_inversor: 'falta',
  cedula: 'falta',
  documentos_legales: 'falta',
  cuestionario_asesor: 'falta',
  status: 'incompleto',
  updated_at: null,
  updated_by: null,
}

function pickCompliance(comp: any) {
  return {
    id: comp.id,
    ficha_cliente: comp.ficha_cliente ?? 'falta',
    perfil_inversor: comp.perfil_inversor ?? 'falta',
    cedula: comp.cedula ?? 'falta',
    documentos_legales: comp.documentos_legales ?? 'falta',
    cuestionario_asesor: comp.cuestionario_asesor ?? 'falta',
    status: comp.status,
    updated_at: comp.updated_at,
    updated_by: comp.updated_by,
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const client_id = searchParams.get('client_id')
    const type = searchParams.get('type') as 'local' | 'internacional' | null

    if (client_id) {
      const [{ data: complianceData }, { data: clientData }] = await Promise.all([
        supabaseAdmin.from('client_compliance').select('*').eq('client_id', client_id).maybeSingle(),
        supabaseAdmin
          .from('clients')
          .select('id, client_number, first_name, last_name, client_type, onedrive_folder_url, status, advisor')
          .eq('id', client_id)
          .single(),
      ])

      if (!clientData) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

      return NextResponse.json({
        client_id: clientData.id,
        client_number: clientData.client_number,
        first_name: clientData.first_name,
        last_name: clientData.last_name,
        client_type: clientData.client_type,
        onedrive_folder_url: clientData.onedrive_folder_url,
        status: clientData.status,
        advisor: clientData.advisor,
        compliance: complianceData ? pickCompliance(complianceData) : { ...DEFAULT_COMPLIANCE },
      })
    }

    // All clients
    let clientsQuery = supabaseAdmin
      .from('clients')
      .select('id, client_number, first_name, last_name, client_type, onedrive_folder_url, status, advisor')
      .order('last_name', { ascending: true })

    if (type) clientsQuery = clientsQuery.eq('client_type', type)

    const [{ data: clients }, { data: complianceRecords }] = await Promise.all([
      clientsQuery,
      supabaseAdmin.from('client_compliance').select('*'),
    ])

    const complianceMap = new Map<string, any>()
    for (const rec of complianceRecords ?? []) {
      complianceMap.set(rec.client_id, rec)
    }

    const result = (clients ?? []).map((c) => {
      const comp = complianceMap.get(c.id)
      return {
        client_id: c.id,
        client_number: c.client_number,
        first_name: c.first_name,
        last_name: c.last_name,
        client_type: c.client_type,
        onedrive_folder_url: c.onedrive_folder_url,
        status: c.status,
        advisor: c.advisor,
        compliance: comp ? pickCompliance(comp) : { ...DEFAULT_COMPLIANCE },
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { client_id, field, value, changed_by } = body as {
      client_id: string
      field: string
      value: DocState
      changed_by?: string
    }

    if (!client_id || !field) {
      return NextResponse.json({ error: 'client_id and field are required' }, { status: 400 })
    }

    if (!COMPLIANCE_FIELDS.includes(field as ComplianceField)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    const validStates: DocState[] = ['falta', 'pedido', 'recibido', 'revisado', 'vencido']
    if (!validStates.includes(value)) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('client_compliance')
      .select('*')
      .eq('client_id', client_id)
      .maybeSingle()

    const now = new Date().toISOString()
    let updatedRecord

    if (existing) {
      const oldValue = existing[field as ComplianceField] as string
      const updatedFields = { ...existing, [field]: value }
      const newStatus = computeStatus(updatedFields)

      const { data, error } = await supabaseAdmin
        .from('client_compliance')
        .update({ [field]: value, status: newStatus, updated_at: now, updated_by: changed_by ?? null })
        .eq('client_id', client_id)
        .select()
        .single()

      if (error) throw error
      updatedRecord = data

      await supabaseAdmin.from('client_compliance_history').insert({
        client_id,
        field_name: field,
        old_value: oldValue,
        new_value: value,
        changed_by: changed_by ?? null,
        changed_at: now,
      })
    } else {
      const newFields: Record<string, string> = {
        ficha_cliente: 'falta',
        perfil_inversor: 'falta',
        cedula: 'falta',
        documentos_legales: 'falta',
        cuestionario_asesor: 'falta',
        [field]: value,
      }
      const newStatus = computeStatus(newFields)

      const { data, error } = await supabaseAdmin
        .from('client_compliance')
        .insert({ client_id, ...newFields, status: newStatus, updated_at: now, updated_by: changed_by ?? null })
        .select()
        .single()

      if (error) throw error
      updatedRecord = data

      await supabaseAdmin.from('client_compliance_history').insert({
        client_id,
        field_name: field,
        old_value: 'falta',
        new_value: value,
        changed_by: changed_by ?? null,
        changed_at: now,
      })
    }

    return NextResponse.json(pickCompliance(updatedRecord))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      client_id,
      ficha_cliente = 'falta',
      perfil_inversor = 'falta',
      cedula = 'falta',
      documentos_legales = 'falta',
      cuestionario_asesor = 'falta',
      notes,
      updated_by,
    } = body

    if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

    const fields = { ficha_cliente, perfil_inversor, cedula, documentos_legales, cuestionario_asesor }
    const status = computeStatus(fields)
    const now = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('client_compliance')
      .upsert(
        { client_id, ...fields, status, notes: notes ?? null, updated_at: now, updated_by: updated_by ?? null },
        { onConflict: 'client_id' }
      )
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
