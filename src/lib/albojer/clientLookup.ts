import { pool } from '@/lib/db/pool'

/**
 * Carpeta de OneDrive donde vive la planilla "Analisis Albojer": la de De
 * Bellis (cuenta Pershing ROJ900554, titulares Alejandro y Patricia De
 * Bellis), no la de "Albojer, Nicolas" que es otro cliente.
 *
 * Se busca por la URL de la carpeta y no por client_number porque el
 * registro de Patricia De Bellis (7877214) apunta a esa carpeta pero sin
 * drive_id/item_id; se toma cualquier cliente vinculado a esa carpeta que sí
 * los tenga.
 */
const FOLDER_URL_SUFFIX = '/Clientes/Sandra/De%20Bellis'

export interface AlbojerClientFolder {
  driveId: string
  itemId: string
}

export async function getAlbojerClientFolder(): Promise<AlbojerClientFolder> {
  const { rows } = await pool.query<{ drive_id: string; item_id: string }>(
    `select distinct drive_id, item_id from clients
     where onedrive_folder_url ilike '%' || $1
       and drive_id is not null and item_id is not null`,
    [FOLDER_URL_SUFFIX]
  )
  if (rows.length === 0) {
    throw new Error('No hay ningún cliente vinculado a la carpeta "Clientes/Sandra/De Bellis" con drive_id/item_id de OneDrive.')
  }
  if (rows.length > 1) {
    throw new Error(`La carpeta "Clientes/Sandra/De Bellis" aparece con ${rows.length} IDs de OneDrive distintos — hace falta revisar los vínculos de clientes.`)
  }
  return { driveId: rows[0].drive_id, itemId: rows[0].item_id }
}
