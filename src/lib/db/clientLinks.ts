import { pool } from './pool'
import { normalizeNameKey } from '@/lib/normalizeName'

export interface ClientLinkResult {
  client_number: string | null
  banco_central: boolean
  folder: boolean
  /** Lo que todavía no se pudo vincular, en palabras para mostrarle al usuario. */
  missing: string[]
}

// Deja al cliente de una apertura vinculado con las tres cosas que siempre
// tiene que tener: su número de cliente/Banco Central, su legajo en Banco
// Central (banco_central_records.linked_client_id) y la carpeta de OneDrive.
// Se completa solo lo que falta — nunca pisa un vínculo ya hecho.
export async function linkClientForOpening(openingId: string, clientId: string): Promise<ClientLinkResult> {
  const { rows: [opening] } = await pool.query(
    `select folder_name, web_url, onedrive_url from account_openings where id = $1`,
    [openingId]
  )
  const { rows: [client] } = await pool.query(
    `select id, first_name, last_name, client_number, web_url, onedrive_folder_url from clients where id = $1`,
    [clientId]
  )
  if (!client) return { client_number: null, banco_central: false, folder: false, missing: ['cliente'] }

  // Carpeta de OneDrive: la de la apertura si el cliente no tiene
  let folder = !!(client.web_url || client.onedrive_folder_url)
  const openingFolder = opening?.web_url ?? opening?.onedrive_url ?? null
  if (!folder && openingFolder) {
    await pool.query(
      `update clients set web_url = coalesce(web_url, $1), onedrive_folder_url = coalesce(onedrive_folder_url, $1), updated_at = now() where id = $2`,
      [openingFolder, clientId]
    )
    folder = true
  }

  // Número de cliente: el de la carpeta ("7683299 - Nombre") si el cliente no tiene
  let clientNumber: string | null = client.client_number || null
  if (!clientNumber) {
    const m = String(opening?.folder_name ?? '').match(/^(\d+)\s*[-–]/)
    if (m) clientNumber = m[1]
  }

  // Legajo de Banco Central
  let bcLinked = false
  const { rows: linked } = await pool.query(
    `select id, customer_number from banco_central_records where linked_client_id = $1 limit 1`,
    [clientId]
  )
  if (linked.length > 0) {
    bcLinked = true
    clientNumber = clientNumber ?? linked[0].customer_number ?? null
  } else {
    let recordId: string | null = null
    if (clientNumber) {
      const { rows } = await pool.query(
        `select id from banco_central_records where customer_number = $1 and linked_client_id is null limit 2`,
        [clientNumber]
      )
      if (rows.length === 1) recordId = rows[0].id
    }
    if (!recordId) {
      // Sin número (o sin legajo con ese número): emparejar por nombre, solo si es único
      const key = normalizeNameKey(`${client.first_name ?? ''} ${client.last_name ?? ''}`)
      if (key) {
        const { rows } = await pool.query(
          `select id, customer_number, nombre_cliente, folder_name from banco_central_records where linked_client_id is null`
        )
        const matches = rows.filter(r => normalizeNameKey(r.nombre_cliente ?? r.folder_name) === key)
        if (matches.length === 1) {
          recordId = matches[0].id
          clientNumber = clientNumber ?? matches[0].customer_number ?? null
        }
      }
    }
    if (recordId) {
      await pool.query(`update banco_central_records set linked_client_id = $1, updated_at = now() where id = $2`, [clientId, recordId])
      bcLinked = true
    }
  }

  // Guardar el número en el cliente si lo obtuvimos y no lo tenía (y no lo usa otro cliente)
  if (clientNumber && !client.client_number) {
    await pool.query(
      `update clients set client_number = $1, updated_at = now()
       where id = $2 and not exists (select 1 from clients where client_number = $1 and id <> $2)`,
      [clientNumber, clientId]
    )
  }

  const missing: string[] = []
  if (!clientNumber) missing.push('número de cliente')
  if (!bcLinked) missing.push('legajo de Banco Central')
  if (!folder) missing.push('carpeta de OneDrive')
  return { client_number: clientNumber, banco_central: bcLinked, folder, missing }
}
