import { pool } from './pool'
import { nameMatchKey } from '@/lib/normalizeName'

export interface DuplicateClient {
  id: string
  first_name: string | null
  last_name: string | null
  client_number: string | null
  status: string | null
  advisor: string | null
  email: string | null
  phone: string | null
  has_folder: boolean
  openings: number
  bc_records: number
  created_at: string
}

export interface DuplicateGroup {
  key: string
  clients: DuplicateClient[]
  /** Cliente que conviene conservar (el que ya tiene número de Banco Central). */
  suggested_keep: string
  /** Par "clásico": uno con número y sin carpeta, el otro con carpeta y sin número. */
  safe: boolean
}

// Clientes con el mismo nombre (sin importar tildes, mayúsculas u orden de
// las palabras): candidatos a ser la misma persona duplicada.
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const { rows } = await pool.query(
    `select c.id, c.first_name, c.last_name, c.client_number, c.status, c.advisor, c.email, c.phone, c.created_at,
            (coalesce(c.web_url, '') <> '' or coalesce(c.onedrive_folder_url, '') <> '' or c.item_id is not null) as has_folder,
            (select count(*) from account_openings o where o.client_id = c.id)::int as openings,
            (select count(*) from banco_central_records b where b.linked_client_id = c.id)::int as bc_records
       from clients c`
  )
  const byKey = new Map<string, DuplicateClient[]>()
  for (const r of rows as DuplicateClient[]) {
    const key = nameMatchKey(`${r.first_name ?? ''} ${r.last_name ?? ''}`)
    if (!key) continue
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }
  const groups: DuplicateGroup[] = []
  for (const [key, clients] of Array.from(byKey.entries())) {
    if (clients.length < 2) continue
    const sorted = [...clients].sort((a, b) =>
      Number(!!b.client_number) - Number(!!a.client_number) ||
      Number(b.has_folder) - Number(a.has_folder) ||
      String(a.created_at).localeCompare(String(b.created_at))
    )
    const safe =
      clients.length === 2 &&
      clients.some(c => c.client_number && !c.has_folder) &&
      clients.some(c => !c.client_number && c.has_folder)
    groups.push({ key, clients: sorted, suggested_keep: sorted[0].id, safe })
  }
  return groups.sort((a, b) => Number(b.safe) - Number(a.safe) || a.key.localeCompare(b.key))
}

// Campos que el cliente que se conserva toma del descartado si los tiene vacíos.
const FILL_FIELDS = [
  'client_number', 'client_type', 'email', 'phone', 'advisor',
  'web_url', 'onedrive_folder_url', 'drive_id', 'item_id', 'parent_path', 'last_synced_at',
  'birth_date', 'address', 'document_type', 'document_number', 'risk_profile',
]

// Fusiona `dropId` dentro de `keepId`: pasa todo lo que apunta al descartado
// (aperturas, legajos de Banco Central, tareas, propuestas, notas, etc.) al
// que se conserva, completa los campos vacíos y borra el duplicado. Todo en una
// transacción: si algo no se puede mover, no se cambia nada.
export async function mergeClients(keepId: string, dropId: string) {
  if (keepId === dropId) throw new Error('No se puede fusionar un cliente consigo mismo')
  const conn = await pool.connect()
  try {
    await conn.query('BEGIN')
    const { rows: found } = await conn.query(`select * from clients where id = any($1) for update`, [[keepId, dropId]])
    const keep = found.find(r => r.id === keepId)
    const drop = found.find(r => r.id === dropId)
    if (!keep || !drop) throw new Error('Cliente no encontrado')

    // Todas las columnas que apuntan a clients: por FK, y por nombre (client_id /
    // linked_client_id) para las tablas que no declaran la FK (ej: bc_fichas).
    const { rows: refs } = await conn.query(
      `select distinct t.relname as tbl, a.attname as col
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = 'public.clients'::regclass and array_length(c.conkey, 1) = 1
       union
       select c.table_name, c.column_name
         from information_schema.columns c
         join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
        where c.table_schema = 'public' and c.column_name in ('client_id', 'linked_client_id') and c.data_type = 'uuid'`
    )
    let moved = 0
    for (const { tbl, col } of refs as { tbl: string; col: string }[]) {
      if (tbl === 'clients') continue
      await conn.query('SAVEPOINT mv')
      try {
        const r = await conn.query(`update "${tbl}" set "${col}" = $1 where "${col}" = $2`, [keepId, dropId])
        moved += r.rowCount ?? 0
        await conn.query('RELEASE SAVEPOINT mv')
      } catch (e: any) {
        await conn.query('ROLLBACK TO SAVEPOINT mv')
        throw new Error(`No se pudo mover "${tbl}.${col}" al cliente que se conserva: ${e.message}`)
      }
    }

    // Liberar los campos únicos del descartado antes de copiarlos al que se conserva
    await conn.query(`update clients set client_number = null, item_id = null where id = $1`, [dropId])

    const fill: Record<string, unknown> = {}
    for (const f of FILL_FIELDS) {
      if (f in keep && (keep[f] === null || keep[f] === '') && drop[f] !== null && drop[f] !== '') fill[f] = drop[f]
    }
    // Nombre: si el que se conserva no tiene first_name (nombre completo pegado en last_name)
    // y el otro sí, tomar el nombre separado.
    if (!keep.first_name && drop.first_name) {
      fill.first_name = drop.first_name
      fill.last_name = drop.last_name
    }
    const entries = Object.entries(fill)
    if (entries.length > 0) {
      await conn.query(
        `update clients set ${entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ')}, updated_at = now() where id = $${entries.length + 1}`,
        [...entries.map(([, v]) => v), keepId]
      )
    }

    await conn.query(`delete from clients where id = $1`, [dropId])
    await conn.query(
      `insert into activity_log (entity_type, entity_id, action, description, user_name) values ('client', $1, 'fusionar', $2, null)`,
      [keepId, `Cliente duplicado fusionado (${drop.client_number ?? 'sin número'} · ${drop.first_name ?? ''} ${drop.last_name ?? ''})`.trim()]
    )
    await conn.query('COMMIT')
    return { moved, filled: Object.keys(fill) }
  } catch (e) {
    await conn.query('ROLLBACK')
    throw e
  } finally {
    conn.release()
  }
}

// Fusiona solos los "pares seguros" (dos clientes con el mismo nombre: uno con
// número de Banco Central y sin carpeta, el otro con carpeta y sin número) —
// exactamente el duplicado que genera la sincronización cuando la carpeta de
// Clientes/<asesor> no lleva número. Los demás casos quedan para revisar a
// mano en Clientes > Ver duplicados.
export async function mergeSafeDuplicates(): Promise<{ merged: number; errors: string[] }> {
  const errors: string[] = []
  let merged = 0
  for (const g of await findDuplicateGroups()) {
    if (!g.safe) continue
    const drop = g.clients.find(c => c.id !== g.suggested_keep)!
    try {
      await mergeClients(g.suggested_keep, drop.id)
      merged++
    } catch (e: any) {
      errors.push(`${g.key}: ${e.message}`)
    }
  }
  return { merged, errors }
}
