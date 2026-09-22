import { pool } from './pool'
import { nameMatchKey } from '@/lib/normalizeName'

// Clientes/carpetas eliminados a propósito: los syncs no deben volver a crearlos
// aunque la carpeta de OneDrive o el legajo de Banco Central sigan existiendo.

export interface Descartes {
  numbers: Set<string>
  itemIds: Set<string>
  nameKeys: Set<string>
}

const EMPTY: Descartes = { numbers: new Set(), itemIds: new Set(), nameKeys: new Set() }

function stripFolderNumber(name: string): string {
  const m = name.trim().match(/^(\d+)\s*[-–]\s*(.+)/)
  return m ? m[2].trim() : name
}

export async function loadDescartes(): Promise<Descartes> {
  try {
    const { rows } = await pool.query(`select client_number, item_id, nombre from client_descartes`)
    const d: Descartes = { numbers: new Set(), itemIds: new Set(), nameKeys: new Set() }
    for (const r of rows) {
      if (r.client_number) d.numbers.add(String(r.client_number))
      if (r.item_id) d.itemIds.add(String(r.item_id))
      const key = nameMatchKey(stripFolderNumber(r.nombre ?? ''))
      if (key) d.nameKeys.add(key)
    }
    return d
  } catch (e) {
    // 42P01 = la migración client_descartes.sql todavía no se aplicó en esta base
    if ((e as { code?: string })?.code === '42P01') {
      console.warn('[descartes] tabla client_descartes inexistente: aplicar supabase/migrations/client_descartes.sql')
      return EMPTY
    }
    throw e
  }
}

export function isDescartado(
  d: Descartes,
  q: { number?: string | null; itemId?: string | null; name?: string | null }
): boolean {
  if (q.number && d.numbers.has(q.number)) return true
  if (q.itemId && d.itemIds.has(q.itemId)) return true
  const key = nameMatchKey(q.name ? stripFolderNumber(q.name) : '')
  return !!key && d.nameKeys.has(key)
}

// Se llama antes de borrar un cliente desde la app: deja constancia para que el
// sync no lo vuelva a generar desde su carpeta o legajo.
export async function registrarDescarteDeCliente(clientId: string) {
  try {
    await pool.query(
      `insert into client_descartes (client_number, item_id, nombre, motivo)
       select nullif(client_number, ''), item_id, nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), 'eliminado desde la app'
       from clients where id = $1`,
      [clientId]
    )
  } catch (e) {
    if ((e as { code?: string })?.code !== '42P01') throw e
  }
}
