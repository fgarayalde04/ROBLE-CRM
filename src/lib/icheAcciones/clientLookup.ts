import { getClients } from '@/lib/db/clients'

/**
 * Resuelve la carpeta de OneDrive de Isaac Shcolnik (cliente "Iche").
 * Página especial de un solo cliente — no hace falta un lookup genérico ni
 * env var.
 *
 * `client_number` confirmado contra la base real (14/set/2026):
 * "7877104" → ISAAC SHCOLNIK → onedrive_folder_url
 * ".../Clientes/Sandra/Shcolnik, Isaac" (coincide con la carpeta real usada
 * en el proceso manual). Se usa ese número como clave principal, estable
 * ante cambios de nombre/tildes; si por algún motivo cambiara, cae al
 * fallback por nombre y falla explícito si no hay exactamente 1 resultado.
 */
const ICHE_CLIENT_NUMBER = '7877104'

export interface IcheClientFolder {
  clientId: string
  driveId: string
  itemId: string
}

export async function getIcheClientFolder(): Promise<IcheClientFolder> {
  let candidates = (await getClients(ICHE_CLIENT_NUMBER)).filter(c => c.client_number === ICHE_CLIENT_NUMBER)

  if (candidates.length === 0) {
    // Fallback: el client_number pudo haber cambiado — buscar por nombre y
    // fallar explícito en vez de adivinar cuál es.
    const byName = await getClients('Shcolnik')
    candidates = byName.filter(c => /isaac/i.test(c.first_name ?? '') && /shcolnik/i.test(c.last_name ?? ''))
  }

  if (candidates.length === 0) {
    throw new Error('No se encontró a Isaac Shcolnik en la tabla clients (ni por client_number "7877104" ni por nombre) — cargalo primero con su carpeta de OneDrive vinculada.')
  }
  if (candidates.length > 1) {
    throw new Error(`Hay ${candidates.length} clientes que matchean "Isaac Shcolnik" — hace falta desambiguar a mano antes de continuar.`)
  }

  const client = candidates[0]
  if (!client.drive_id || !client.item_id) {
    throw new Error('Isaac Shcolnik existe en clients pero no tiene drive_id/item_id de OneDrive cargado.')
  }

  return { clientId: client.id, driveId: client.drive_id, itemId: client.item_id }
}
