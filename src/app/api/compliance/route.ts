import { NextResponse } from 'next/server'
import {
  COMPLIANCE_FIELDS, type ComplianceField, type DocState,
  pickCompliance, getClientWithCompliance, listClientsWithCompliance,
  upsertComplianceField, upsertComplianceRecord,
} from '@/lib/db/compliance'

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const client_id = searchParams.get('client_id')
    const type = searchParams.get('type') as 'local' | 'internacional' | null

    if (client_id) {
      const { compliance, client: clientData } = await getClientWithCompliance(client_id)

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
        compliance: compliance ? pickCompliance(compliance) : { ...DEFAULT_COMPLIANCE },
      })
    }

    // All clients
    const { clients, complianceMap } = await listClientsWithCompliance(type)

    const result = clients.map((c) => {
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

    const updatedRecord = await upsertComplianceField(client_id, field as ComplianceField, value, changed_by ?? null)

    return NextResponse.json(pickCompliance(updatedRecord))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { client_id, ficha_cliente, perfil_inversor, cedula, documentos_legales, cuestionario_asesor, notes, updated_by } = body

    if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

    const data = await upsertComplianceRecord({
      clientId: client_id, ficha_cliente, perfil_inversor, cedula, documentos_legales, cuestionario_asesor,
      notes, updatedBy: updated_by,
    })
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
