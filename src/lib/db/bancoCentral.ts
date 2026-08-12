import { pool } from './pool'

export const CHECKBOX_FIELDS = [
  'ficha', 'lista_verificacion', 'cuestionario', 'ci', 'cumplo', 'documentos_legales',
] as const
export type CheckboxField = (typeof CHECKBOX_FIELDS)[number]

// documentos_legales solo aplica a sociedades, no a personas físicas — no bloquea "Completo"
export const REQUIRED_FIELDS = [
  'ficha', 'lista_verificacion', 'cuestionario', 'ci', 'cumplo',
] as const satisfies readonly CheckboxField[]

export async function listBancoCentralRecords(type?: string | null, customerNumbers?: string[] | null) {
  const where: string[] = []
  const params: any[] = []
  if (type === 'local' || type === 'internacional') { params.push(type); where.push(`type = $${params.length}`) }
  if (customerNumbers !== undefined && customerNumbers !== null) {
    if (customerNumbers.length === 0) {
      where.push(`1 = 0`)
    } else {
      params.push(customerNumbers)
      where.push(`customer_number = ANY($${params.length})`)
    }
  }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select b.*, c.first_name as client_first_name, c.last_name as client_last_name
     from banco_central_records b
     left join clients c on c.id = b.linked_client_id
     ${whereClause.replace(/\btype =/g, 'b.type =').replace(/\bcustomer_number =/g, 'b.customer_number =')}
     order by b.customer_number asc nulls last, b.folder_name asc`,
    params
  )
  return rows
}

export async function getBancoCentralCheckboxes(id: string) {
  const { rows } = await pool.query(
    `select ${CHECKBOX_FIELDS.join(', ')} from banco_central_records where id = $1`,
    [id]
  )
  return rows[0] ?? null
}

export async function closeBancoCentralRecord(id: string) {
  await pool.query(`update banco_central_records set status = 'cerrada', updated_at = now() where id = $1`, [id])
}

export async function reopenBancoCentralRecord(id: string) {
  const row = await getBancoCentralCheckboxes(id)
  const allChecked = REQUIRED_FIELDS.every((f) => row?.[f] === true)
  const newStatus = allChecked ? 'completo' : 'incompleto'
  await pool.query(`update banco_central_records set status = $1, updated_at = now() where id = $2`, [newStatus, id])
  return newStatus
}

export async function updateBancoCentralText(id: string, field: 'comentario' | 'fa' | 'customer_number', value: string) {
  await pool.query(`update banco_central_records set "${field}" = $1, updated_at = now() where id = $2`, [value, id])
}

export async function updateBancoCentralCheckbox(id: string, field: CheckboxField, value: boolean) {
  const row = await getBancoCentralCheckboxes(id)
  if (!row) return null
  const merged = { ...row, [field]: value }
  const allChecked = REQUIRED_FIELDS.every((f) => merged[f] === true)
  const newStatus = allChecked ? 'completo' : 'incompleto'
  await pool.query(
    `update banco_central_records set "${field}" = $1, status = $2, updated_at = now() where id = $3`,
    [value, newStatus, id]
  )
  return newStatus
}

export async function bulkRestoreBancoCentralCheckboxes(records: ({ id: string } & Partial<Record<CheckboxField, boolean>>)[]) {
  let updated = 0
  for (const rec of records) {
    const checkboxes: Partial<Record<CheckboxField, boolean>> = {}
    for (const f of CHECKBOX_FIELDS) {
      if (typeof rec[f] === 'boolean') checkboxes[f] = rec[f]
    }
    const allChecked = REQUIRED_FIELDS.every((f) => checkboxes[f] === true)
    const entries = Object.entries(checkboxes)
    const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
    const values: any[] = entries.map(([, v]) => v)
    values.push(allChecked ? 'completo' : 'incompleto', rec.id)
    try {
      await pool.query(
        `update banco_central_records set ${setClause.join(', ')}, status = $${values.length - 1}, updated_at = now() where id = $${values.length}`,
        values
      )
      updated++
    } catch { /* skip failed row, matches original per-row error tolerance */ }
  }
  return updated
}

// ─── bc_fichas ───────────────────────────────────────────────────────────────

export async function searchBancoCentralRecords(q: string) {
  const like = `%${q}%`
  const { rows } = await pool.query(
    `select id, customer_number, folder_name, type, fa, status, authorized_email
     from banco_central_records
     where folder_name ilike $1 or customer_number ilike $1 or fa ilike $1
     order by folder_name asc limit 25`,
    [like]
  )
  return rows
}

export async function getClientEmailsByNumbers(customerNumbers: string[]) {
  if (customerNumbers.length === 0) return []
  const { rows } = await pool.query(
    `select client_number, email from clients where client_number = ANY($1)`,
    [customerNumbers]
  )
  return rows
}

export async function updateBancoCentralAuthorizedEmail(id: string, email: string) {
  await pool.query(`update banco_central_records set authorized_email = $1 where id = $2`, [email, id])
}

export async function listBcFichas(empresa?: string | null, tipo?: string | null) {
  const where: string[] = []
  const params: any[] = []
  if (empresa) { params.push(empresa); where.push(`empresa = $${params.length}`) }
  if (tipo) { params.push(tipo); where.push(`tipo_cliente = $${params.length}`) }
  const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select id, empresa, tipo_cliente, client_name, perfil_result, perfil_score, created_at, updated_at
     from bc_fichas ${whereClause} order by updated_at desc`,
    params
  )
  return rows
}

export async function createBcFicha(input: {
  empresa: string; tipo_cliente: string; client_id?: string | null; client_name?: string | null
  ficha_data?: any; perfil_data?: any; lista_data?: any; perfil_score?: number | null; perfil_result?: string | null
  created_by: string
}) {
  const { rows } = await pool.query(
    `insert into bc_fichas (empresa, tipo_cliente, client_id, client_name, ficha_data, perfil_data, lista_data, perfil_score, perfil_result, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [
      input.empresa, input.tipo_cliente, input.client_id ?? null, input.client_name ?? null,
      JSON.stringify(input.ficha_data ?? {}), JSON.stringify(input.perfil_data ?? {}), JSON.stringify(input.lista_data ?? {}),
      input.perfil_score ?? null, input.perfil_result ?? null, input.created_by,
    ]
  )
  return rows[0]
}

export async function getBcFicha(id: string) {
  const { rows } = await pool.query(`select * from bc_fichas where id = $1`, [id])
  return rows[0] ?? null
}

export async function updateBcFicha(id: string, updates: Record<string, any>) {
  const jsonFields = new Set(['ficha_data', 'perfil_data', 'lista_data'])
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => jsonFields.has(k) ? `"${k}" = $${i + 1}::jsonb` : `"${k}" = $${i + 1}`)
  const values = entries.map(([k, v]) => (jsonFields.has(k) ? JSON.stringify(v) : v))
  const { rows } = await pool.query(
    `update bc_fichas set ${setClause.join(', ')}, updated_at = now() where id = $${values.length + 1} returning *`,
    [...values, id]
  )
  return rows[0] ?? null
}

export async function deleteBcFicha(id: string) {
  await pool.query(`delete from bc_fichas where id = $1`, [id])
}
