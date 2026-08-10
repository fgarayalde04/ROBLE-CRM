import { pool } from './pool'

export const COMPLIANCE_FIELDS = ['ficha_cliente', 'perfil_inversor', 'cedula', 'documentos_legales', 'cuestionario_asesor'] as const
export type ComplianceField = typeof COMPLIANCE_FIELDS[number]
export type DocState = 'falta' | 'pedido' | 'recibido' | 'revisado' | 'vencido'

const DONE_STATES: DocState[] = ['recibido', 'revisado']

export function computeStatus(record: Record<string, string>): 'completo' | 'incompleto' {
  const allDone = COMPLIANCE_FIELDS.every((f) => DONE_STATES.includes(record[f] as DocState))
  return allDone ? 'completo' : 'incompleto'
}

export function pickCompliance(comp: any) {
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

export async function getClientWithCompliance(clientId: string) {
  const [{ rows: complianceRows }, { rows: clientRows }] = await Promise.all([
    pool.query(`select * from client_compliance where client_id = $1`, [clientId]),
    pool.query(
      `select id, client_number, first_name, last_name, client_type, onedrive_folder_url, status, advisor
       from clients where id = $1`,
      [clientId]
    ),
  ])
  return { compliance: complianceRows[0] ?? null, client: clientRows[0] ?? null }
}

export async function listClientsWithCompliance(type?: string | null) {
  const params: any[] = []
  let where = ''
  if (type) { params.push(type); where = `where client_type = $1` }

  const [{ rows: clients }, { rows: complianceRecords }] = await Promise.all([
    pool.query(
      `select id, client_number, first_name, last_name, client_type, onedrive_folder_url, status, advisor
       from clients ${where} order by last_name asc`,
      params
    ),
    pool.query(`select * from client_compliance`),
  ])

  const complianceMap = new Map<string, any>()
  for (const rec of complianceRecords) complianceMap.set(rec.client_id, rec)

  return { clients, complianceMap }
}

export async function getComplianceRecord(clientId: string) {
  const { rows } = await pool.query(`select * from client_compliance where client_id = $1`, [clientId])
  return rows[0] ?? null
}

export async function upsertComplianceField(
  clientId: string,
  field: ComplianceField,
  value: DocState,
  changedBy: string | null
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: existingRows } = await client.query(`select * from client_compliance where client_id = $1`, [clientId])
    const existing = existingRows[0]
    const now = new Date().toISOString()
    let updatedRecord

    if (existing) {
      const oldValue = existing[field]
      const updatedFields = { ...existing, [field]: value }
      const newStatus = computeStatus(updatedFields)

      const { rows } = await client.query(
        `update client_compliance set "${field}" = $1, status = $2, updated_at = $3, updated_by = $4 where client_id = $5 returning *`,
        [value, newStatus, now, changedBy, clientId]
      )
      updatedRecord = rows[0]

      await client.query(
        `insert into client_compliance_history (client_id, field_name, old_value, new_value, changed_by, changed_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [clientId, field, oldValue, value, changedBy, now]
      )
    } else {
      const newFields: Record<string, string> = {
        ficha_cliente: 'falta', perfil_inversor: 'falta', cedula: 'falta',
        documentos_legales: 'falta', cuestionario_asesor: 'falta', [field]: value,
      }
      const newStatus = computeStatus(newFields)

      const { rows } = await client.query(
        `insert into client_compliance (client_id, ficha_cliente, perfil_inversor, cedula, documentos_legales, cuestionario_asesor, status, updated_at, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [clientId, newFields.ficha_cliente, newFields.perfil_inversor, newFields.cedula, newFields.documentos_legales, newFields.cuestionario_asesor, newStatus, now, changedBy]
      )
      updatedRecord = rows[0]

      await client.query(
        `insert into client_compliance_history (client_id, field_name, old_value, new_value, changed_by, changed_at)
         values ($1, $2, 'falta', $3, $4, $5)`,
        [clientId, field, value, changedBy, now]
      )
    }

    await client.query('COMMIT')
    return updatedRecord
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function upsertComplianceRecord(input: {
  clientId: string
  ficha_cliente?: DocState; perfil_inversor?: DocState; cedula?: DocState
  documentos_legales?: DocState; cuestionario_asesor?: DocState
  notes?: string | null; updatedBy?: string | null
}) {
  const fields = {
    ficha_cliente: input.ficha_cliente ?? 'falta',
    perfil_inversor: input.perfil_inversor ?? 'falta',
    cedula: input.cedula ?? 'falta',
    documentos_legales: input.documentos_legales ?? 'falta',
    cuestionario_asesor: input.cuestionario_asesor ?? 'falta',
  }
  const status = computeStatus(fields)
  const now = new Date().toISOString()

  const { rows } = await pool.query(
    `insert into client_compliance (client_id, ficha_cliente, perfil_inversor, cedula, documentos_legales, cuestionario_asesor, status, notes, updated_at, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (client_id) do update set
       ficha_cliente = excluded.ficha_cliente, perfil_inversor = excluded.perfil_inversor,
       cedula = excluded.cedula, documentos_legales = excluded.documentos_legales,
       cuestionario_asesor = excluded.cuestionario_asesor, status = excluded.status,
       notes = excluded.notes, updated_at = excluded.updated_at, updated_by = excluded.updated_by
     returning *`,
    [input.clientId, fields.ficha_cliente, fields.perfil_inversor, fields.cedula, fields.documentos_legales, fields.cuestionario_asesor, status, input.notes ?? null, now, input.updatedBy ?? null]
  )
  return rows[0]
}
