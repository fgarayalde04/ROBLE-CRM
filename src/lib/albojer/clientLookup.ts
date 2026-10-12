import { getClients } from '@/lib/db/clients'

/**
 * Carpeta de OneDrive de Patricia De Bellis (cuenta Pershing ROJ900554,
 * apodada "Albojer") — ahí vive la planilla "Analisis Albojer". No confundir
 * con el cliente "Albojer, Nicolas" (7877323), que es otro.
 *
 * Mismo criterio que Iche: `client_number` como clave estable y, si cambiara,
 * fallback por nombre fallando explícito si no hay exactamente 1 resultado.
 */
const ALBOJER_CLIENT_NUMBER = '7877214'

export interface AlbojerClientFolder {
  driveId: string
  itemId: string
}

export async function getAlbojerClientFolder(): Promise<AlbojerClientFolder> {
  let candidates = (await getClients(ALBOJER_CLIENT_NUMBER)).filter(c => c.client_number === ALBOJER_CLIENT_NUMBER)

  if (candidates.length === 0) {
    const byName = await getClients('De Bellis')
    candidates = byName.filter(c => /patricia/i.test(c.first_name ?? '') && /de\s*bellis/i.test(c.last_name ?? ''))
  }

  if (candidates.length === 0) {
    throw new Error('No se encontró a Patricia De Bellis en la tabla clients (ni por client_number "7877214" ni por nombre).')
  }
  if (candidates.length > 1) {
    throw new Error(`Hay ${candidates.length} clientes que matchean "Patricia De Bellis" — hace falta desambiguar a mano antes de continuar.`)
  }

  const client = candidates[0]
  if (!client.drive_id || !client.item_id) {
    throw new Error('Patricia De Bellis existe en clients pero no tiene vinculada su carpeta de OneDrive (drive_id/item_id).')
  }
  return { driveId: client.drive_id, itemId: client.item_id }
}
