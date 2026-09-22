import {
  insertOpeningChecklistItems, insertSyncLog,
  getKnownClientsForSync, getKnownOpeningItemIds,
  updateClientSharePointFieldsByItemId, updateClientSharePointFieldsById,
  insertPendingClient, insertAccountOpeningStub, setClientNumberIfFree,
  getBancoCentralByItemIds, getBancoCentralWithCustomerNumberByType,
  getLegajosNeedingContact, fillClientContact,
  bulkInsertBancoCentralRecords, updateBancoCentralRecordById,
  getUnlinkedBancoCentralWithNumber, getClientIdsByNumbers, setBancoCentralLinkedClient,
  getRecursoByItemId, insertRecurso, updateRecursoById,
  getScoringFileByItemId, insertScoringFile, updateScoringFileById,
} from '@/lib/db/sync'
import { getGraphToken, listFolderChildren, downloadDriveFile, DriveItem } from './graph'
import { docxToText, parseFichaText, findFichaFile } from './fichaParser'
import { nameMatchKey } from '@/lib/normalizeName'
import { loadDescartes, isDescartado, type Descartes } from '@/lib/db/descartes'
import { mergeSafeDuplicates } from '@/lib/db/clientMerge'

export interface SyncResult {
  found: number
  created: number
  updated: number
  errors: string[]
}

// The advisor subfolders to look for under Clientes/
const ADVISOR_FOLDERS = ['Francisco', 'Guillermo', 'Sandra', 'Ines', 'Javier', 'Fernando - Federico']
const DEFAULT_OPENING_CHECKLIST = [
  'Ficha de cliente hecha',
  'Cedulas conseguidas',
  'Comprobante de domicilio recibido',
  'Informacion de madre/padre completa',
  'Perfil de riesgo completado',
  'Formularios enviados al cliente',
  'Formularios firmados recibidos',
  'Documentacion revisada internamente',
  'Documentacion enviada al banco',
  'Confirmacion del banco recibida',
  'Numero de cliente asignado',
  'Cuenta marcada como activa',
]

function parseClientFolderName(folderName: string): {
  clientNumber: string | null
  displayName: string
} {
  const numMatch = folderName.match(/^(\d+)\s*[-–]\s*(.+)/)
  if (numMatch) {
    return { clientNumber: numMatch[1], displayName: numMatch[2].trim() }
  }
  return { clientNumber: null, displayName: folderName }
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

interface ExistingClientMatch {
  id: string
  status: string | null
}

async function createDefaultOpeningChecklist(openingId: string) {
  await insertOpeningChecklistItems(openingId, DEFAULT_OPENING_CHECKLIST)
}

async function logSync(
  syncType: string,
  status: 'success' | 'error' | 'partial',
  result: SyncResult,
  startedAt: Date,
  message?: string
) {
  await insertSyncLog({
    sync_type: syncType,
    status,
    message: message ?? null,
    records_found: result.found,
    records_created: result.created,
    records_updated: result.updated,
    error_detail: result.errors.length ? result.errors.join('\n') : null,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  })
}

// ── Sync Clientes ────────────────────────────────────────────────────────────
// Reads: CLIENTES_DRIVE_ID / CLIENTES_FOLDER_ID
// Structure: Clientes/ > AdvisorName/ > folder per client
//
// Rules (source of truth = folder.createdDateTime from OneDrive):
//   • item_id already in clients          → UPDATE fields only, never touch apertura
//   • item_id already in account_openings → SKIP (no duplicates)
//   • createdDateTime < CUTOFF_DATE       → INSERT into clients (historical)
//   • createdDateTime ≥ CUTOFF_DATE       → INSERT into account_openings (new)

// Folders created before this date are historical clients, not openings.
const HISTORICAL_CUTOFF = new Date('2026-06-02T00:00:00Z')

export async function syncClients(): Promise<SyncResult> {
  const startedAt = new Date()
  const result: SyncResult = { found: 0, created: 0, updated: 0, errors: [] }

  const driveId = process.env.CLIENTES_DRIVE_ID
  const folderId = process.env.CLIENTES_FOLDER_ID

  if (!driveId || !folderId) {
    const err = 'CLIENTES_DRIVE_ID or CLIENTES_FOLDER_ID not configured'
    result.errors.push(err)
    await logSync('clientes', 'error', result, startedAt, err)
    return result
  }

  // Load all tracked item_ids and client_numbers to avoid duplicates
  const knownClientIds = new Set<string>()        // item_id → already a client
  const knownOpeningIds = new Set<string>()       // item_id → already an opening
  const clientByNumber = new Map<string, string>() // client_number → client.id
  // Clientes todavía sin carpeta de OneDrive (ej: los que nacen de un legajo
  // de Banco Central), por nombre normalizado. null = hay más de uno con ese
  // nombre → ambiguo, no se empareja por nombre.
  const unlinkedByName = new Map<string, { id: string; client_number: string | null } | null>()
  // Clientes/carpetas eliminados a propósito: no se vuelven a crear.
  let descartes: Descartes = { numbers: new Set(), itemIds: new Set(), nameKeys: new Set() }
  try {
    const [existingClients, existingOpeningItemIds] = await Promise.all([
      getKnownClientsForSync(),
      getKnownOpeningItemIds(),
    ])
    for (const c of existingClients ?? []) {
      // Si la carpeta enlazada es la del legajo (no la de Clientes), no cuenta
      // como "ya tiene su carpeta": queda disponible para emparejarla con la de
      // Clientes por número o por nombre, y ahí se reemplaza el enlace.
      if (c.item_id && !c.folder_is_legajo) knownClientIds.add(c.item_id)
      if (c.client_number) clientByNumber.set(c.client_number, c.id)
      if (!c.item_id || c.folder_is_legajo) {
        const nameKey = nameMatchKey(`${c.first_name ?? ''} ${c.last_name ?? ''}`)
        if (nameKey) unlinkedByName.set(nameKey, unlinkedByName.has(nameKey) ? null : { id: c.id, client_number: c.client_number ?? null })
      }
    }
    for (const itemId of existingOpeningItemIds ?? []) knownOpeningIds.add(itemId)
    descartes = await loadDescartes()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    result.errors.push(`Failed to load known IDs: ${msg}`)
    await logSync('clientes', 'error', result, startedAt, msg)
    return result
  }

  try {
    const token = await getGraphToken()

    const advisorFolders = await listFolderChildren(driveId, folderId, token)
    const targetAdvisors = advisorFolders.filter(
      f => f.folder && ADVISOR_FOLDERS.some(a => f.name.toLowerCase().includes(a.toLowerCase()))
    )

    for (const advisorFolder of targetAdvisors) {
      const advisorName = advisorFolder.name
      try {
        const clientFolders = await listFolderChildren(driveId, advisorFolder.id, token)
        const onlyFolders = clientFolders.filter(f => f.folder)
        result.found += onlyFolders.length

        for (const clientFolder of onlyFolders) {
          try {
            const folderName = clientFolder.name.trim()
            const { clientNumber, displayName } = parseClientFolderName(folderName)
            const itemId = clientFolder.id
            const createdAt = clientFolder.createdDateTime
              ? new Date(clientFolder.createdDateTime)
              : null

            // ── 1. Already a client by item_id → update SharePoint fields only ──
            if (knownClientIds.has(itemId)) {
              await updateClientSharePointFieldsByItemId(itemId, {
                drive_id: driveId,
                web_url: clientFolder.webUrl,
                onedrive_folder_url: clientFolder.webUrl,
                parent_path: advisorName,
                advisor: advisorName,
                last_synced_at: new Date().toISOString(),
              })
              result.updated++
              continue
            }

            // ── 2. Existing client matched by client_number → link item_id ──
            // (antes que el chequeo de aperturas: si la carpeta ya tiene una
            // apertura pero el cliente existente sigue sin link, hay que
            // completárselo igual, no saltear la carpeta)
            if (clientNumber && clientByNumber.has(clientNumber)) {
              const existingClientId = clientByNumber.get(clientNumber)!
              await updateClientSharePointFieldsById(existingClientId, {
                item_id: itemId,
                drive_id: driveId,
                web_url: clientFolder.webUrl,
                onedrive_folder_url: clientFolder.webUrl,
                parent_path: advisorName,
                advisor: advisorName,
                last_synced_at: new Date().toISOString(),
              })
              knownClientIds.add(itemId)
              result.updated++
              continue
            }

            // ── 3. Existing client without folder matched by NAME → link it ──
            // Las carpetas de Clientes/<asesor> muchas veces no llevan número
            // ("Nicolas Martin Serrano"), y el cliente que nace de un legajo sí:
            // por número nunca matchean y la ficha quedaba sin link de OneDrive.
            // Solo se empareja si el nombre es único entre los clientes sin carpeta.
            const nameMatch = unlinkedByName.get(nameMatchKey(displayName))
            if (nameMatch) {
              await updateClientSharePointFieldsById(nameMatch.id, {
                item_id: itemId,
                drive_id: driveId,
                web_url: clientFolder.webUrl,
                onedrive_folder_url: clientFolder.webUrl,
                parent_path: advisorName,
                advisor: advisorName,
                last_synced_at: new Date().toISOString(),
              })
              unlinkedByName.delete(nameMatchKey(displayName))
              knownClientIds.add(itemId)
              result.updated++
              continue
            }

            // ── 3b. Carpeta de un cliente eliminado a propósito → no recrearlo ──
            if (isDescartado(descartes, { number: clientNumber, itemId, name: displayName })) {
              continue
            }

            // ── 4. Already in account_openings → skip (no duplicates) ──
            if (knownOpeningIds.has(itemId)) {
              continue
            }

            // ── 5. Truly new folder → Apertura de Cuenta + stub client with status='pendiente' ──
            {
              const now = new Date().toISOString()

              // 1. Create pendiente client so it shows in the clients list
              let newClient: { id: string } | null = null
              try {
                newClient = await insertPendingClient({
                  first_name: '',
                  last_name: displayName,
                  client_number: clientNumber,
                  status: 'prospecto',
                  source: 'sharepoint',
                  drive_id: driveId,
                  item_id: itemId,
                  web_url: clientFolder.webUrl,
                  onedrive_folder_url: clientFolder.webUrl,
                  parent_path: advisorName,
                  advisor: advisorName,
                  last_synced_at: now,
                })
                knownClientIds.add(itemId)
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                result.errors.push(`Insert pending client ${folderName}: ${msg}`)
              }

              // 2. Create apertura linked to the client
              try {
                const opening = await insertAccountOpeningStub({
                  client_id: newClient?.id ?? null,
                  folder_name: folderName,
                  advisor: advisorName,
                  status: 'carpeta_creada',
                  priority: 'normal',
                  start_date: now.split('T')[0],
                  item_id: itemId,
                  drive_id: driveId,
                  web_url: clientFolder.webUrl,
                })
                await createDefaultOpeningChecklist(opening.id)
                result.created++
                knownOpeningIds.add(itemId)
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e)
                result.errors.push(`Opening insert ${folderName}: ${msg}`)
              }
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            result.errors.push(`Folder ${clientFolder.name}: ${msg}`)
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`Advisor ${advisorName}: ${msg}`)
      }
    }

    const status = result.errors.length === 0 ? 'success' : 'partial'
    await logSync('clientes', status, result, startedAt)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    result.errors.push(msg)
    await logSync('clientes', 'error', result, startedAt, msg)
  }

  return result
}

// ── Sync BCU Local (Legajos Cundry) ─────────────────────────────────────────
export async function syncBancoCentralLocal(): Promise<SyncResult> {
  return syncBancoCentral(
    'bcu_local',
    'local',
    process.env.LEGAJOS_CUNDRY_DRIVE_ID,
    process.env.LEGAJOS_CUNDRY_FOLDER_ID
  )
}

// ── Sync BCU Internacional (Legajos Geliene) ─────────────────────────────────
export async function syncBancoCentralInternacional(): Promise<SyncResult> {
  return syncBancoCentral(
    'bcu_internacional',
    'internacional',
    process.env.LEGAJOS_GELIENE_DRIVE_ID,
    process.env.LEGAJOS_GELIENE_FOLDER_ID
  )
}

// Cuántos legajos se leen por corrida (cada uno = listar carpeta + bajar un
// .docx) y cuánto se espera antes de reintentar uno que no dio nada.
const FICHA_BATCH = 15
const FICHA_RETRY_MS = 6 * 60 * 60 * 1000
const fichaAttempts = new Map<string, number>() // item_id → último intento

// Completa nombre, mail y celular de los clientes que nacieron de un legajo
// (vienen sin nada) leyendo la ficha .docx de la carpeta del legajo.
async function enrichClientsFromFichas(token: string, result: SyncResult) {
  const nowMs = Date.now()
  const recent = Array.from(fichaAttempts.entries()).filter(([, t]) => nowMs - t < FICHA_RETRY_MS).map(([id]) => id)
  const legajos = await getLegajosNeedingContact(recent, FICHA_BATCH)

  for (const l of legajos) {
    fichaAttempts.set(l.item_id, nowMs)
    try {
      const ficha = findFichaFile(await listFolderChildren(l.drive_id, l.item_id, token))
      if (!ficha) continue
      const contact = parseFichaText(docxToText(await downloadDriveFile(l.drive_id, ficha.id, token)))
      if (!contact.email && !contact.phone && !contact.first_name) continue
      await fillClientContact(l.client_id, contact)
      result.updated++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // La carpeta del legajo ya no existe en SharePoint (borrada o movida): no es
      // una falla del sync, no hay ficha que leer. Se reintenta recién a las 6 h.
      if (msg.includes('itemNotFound')) {
        console.warn(`[sync] Ficha ${l.item_id}: la carpeta del legajo ya no existe en SharePoint, se omite`)
        continue
      }
      result.errors.push(`Ficha ${l.item_id}: ${msg}`)
    }
  }
}

async function syncBancoCentral(
  logType: string,
  bcuType: 'local' | 'internacional',
  driveId: string | undefined,
  folderId: string | undefined
): Promise<SyncResult> {
  const startedAt = new Date()
  const result: SyncResult = { found: 0, created: 0, updated: 0, errors: [] }

  if (!driveId || !folderId) {
    const err = `Drive/Folder ID for ${logType} not configured`
    result.errors.push(err)
    await logSync(logType, 'error', result, startedAt, err)
    return result
  }

  try {
    const token = await getGraphToken()
    const folders = await listFolderChildren(driveId, folderId, token)
    const onlyFolders = folders.filter(f => f.folder)
    result.found = onlyFolders.length

    if (onlyFolders.length === 0) {
      await logSync(logType, 'success', result, startedAt)
      return result
    }

    // Bulk-load existing records in 2 queries instead of N×3 individual ones
    const allItemIds = onlyFolders.map(f => f.id)
    const [byItemIdRows, byCustomerRows, knownClients] = await Promise.all([
      getBancoCentralByItemIds(allItemIds),
      getBancoCentralWithCustomerNumberByType(bcuType),
      getKnownClientsForSync(),
    ])

    // Build lookup maps
    const byItemId = new Map<string, string>()        // item_id → record id
    const byCustomer = new Map<string, string>()      // customer_number → record id
    for (const r of byItemIdRows ?? []) {
      if (r.item_id) byItemId.set(r.item_id, r.id)
    }
    for (const r of byCustomerRows ?? []) {
      if (r.customer_number) byCustomer.set(r.customer_number, r.id)
    }
    // Un legajo nuevo en Banco Central debe tener también su cliente en la
    // sección Clientes, para poder hacerle el checklist — sin carpeta de
    // OneDrive propia todavía (esa la completa syncClients() por separado,
    // si existe una carpeta bajo Clientes/<asesor>/... — nunca la de Legajos,
    // que es de otra sección).
    const clientByNumber = new Set<string>()
    // Clientes eliminados a propósito: su legajo no vuelve a generar el cliente.
    const descartes = await loadDescartes()
    // Clientes que todavía no tienen número (ej: los que nacieron de la carpeta
    // de Clientes/<asesor> sin número adelante), por nombre. Un legajo nuevo
    // con ese nombre es la MISMA persona: se le da el número en vez de crear un
    // segundo cliente. null = nombre repetido → ambiguo, no se adopta.
    const unnumberedByName = new Map<string, string | null>()
    for (const c of knownClients ?? []) {
      if (c.client_number) clientByNumber.add(c.client_number)
      else {
        const key = nameMatchKey(`${c.first_name ?? ''} ${c.last_name ?? ''}`)
        if (key) unnumberedByName.set(key, unnumberedByName.has(key) ? null : c.id)
      }
    }
    // Devuelve true si el legajo fue adoptado por un cliente existente sin número
    const adoptExistingClient = async (nombre: string, number: string, type: string): Promise<boolean> => {
      const key = nameMatchKey(nombre)
      const id = unnumberedByName.get(key)
      if (!id) return false
      await setClientNumberIfFree(id, number, type)
      unnumberedByName.delete(key)
      return true
    }

    const now = new Date().toISOString()
    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: string; fields: Record<string, unknown> }[] = []
    const newClientStubs: Record<string, unknown>[] = []

    for (const folder of onlyFolders) {
      const folderName = folder.name.trim()
      const numMatch = folderName.match(/^(\d+)\s*[-–]\s*(.+)/)
      const customerNumber = numMatch?.[1]?.trim() ?? null
      const nombreCliente  = numMatch?.[2]?.trim() ?? folderName

      const spFields = {
        drive_id:       driveId,
        item_id:        folder.id,
        web_url:        folder.webUrl ?? null,
        parent_path:    folder.parentReference?.path ?? null,
        source:         'sharepoint',
        last_synced_at: now,
        updated_at:     now,
        nombre_cliente: nombreCliente,
      }

      const existingId =
        byItemId.get(folder.id) ??
        (customerNumber ? byCustomer.get(customerNumber) : undefined)

      if (existingId) {
        toUpdate.push({ id: existingId, fields: spFields })
      } else {
        toInsert.push({
          customer_number: customerNumber,
          folder_name:     folderName,
          folder_path:     null,
          type:            bcuType,
          ...spFields,
        })

        // Legajo nuevo — asegurar que también exista en Clientes, para
        // poder hacerle el checklist de Banco Central. Sin carpeta de
        // OneDrive propia acá (esa es la de Clientes, no la de Legajos) —
        // syncClients() la completa por separado si existe.
        if (customerNumber && !clientByNumber.has(customerNumber) && !isDescartado(descartes, { number: customerNumber }) && !(await adoptExistingClient(nombreCliente, customerNumber, bcuType))) {
          newClientStubs.push({
            first_name:     '',
            last_name:      nombreCliente,
            client_number:  customerNumber,
            status:         'prospecto',
            source:         'sharepoint',
            client_type:    bcuType,
          })
          clientByNumber.add(customerNumber) // evita duplicados si dos legajos comparten número
        }
      }
    }

    // Batch insert new records
    const CHUNK = 200
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      try {
        await bulkInsertBancoCentralRecords(toInsert.slice(i, i + CHUNK))
        result.created += toInsert.slice(i, i + CHUNK).length
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`Insert batch: ${msg}`)
      }
    }

    // Crear los stubs de cliente para los legajos nuevos que no tenían uno
    for (const stub of newClientStubs) {
      try {
        await insertPendingClient(stub)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`Client stub for ${stub.client_number}: ${msg}`)
      }
    }

    // Update existing records in parallel batches
    const UPDATE_CONCURRENCY = 10
    for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
      await Promise.all(
        toUpdate.slice(i, i + UPDATE_CONCURRENCY).map(({ id, fields }) =>
          updateBancoCentralRecordById(id, fields)
        )
      )
      result.updated += toUpdate.slice(i, i + UPDATE_CONCURRENCY).length
    }

    // Reconciliación: legajos (de esta corrida o de antes) que quedaron sin
    // cliente linkeado — crea el cliente si todavía no existe y linkea.
    try {
      const unlinked = await getUnlinkedBancoCentralWithNumber()
      if (unlinked.length > 0) {
        const numbers = Array.from(new Set(unlinked.map((u: any) => u.customer_number as string)))
        const existingClients = await getClientIdsByNumbers(numbers)
        const clientIdByNumber = new Map<string, string>(existingClients.map(c => [c.client_number, c.id]))
        for (const rec of unlinked as any[]) {
          if (isDescartado(descartes, { number: rec.customer_number })) continue
          let clientId: string | undefined = clientIdByNumber.get(rec.customer_number)
          if (!clientId && rec.customer_number && await adoptExistingClient(rec.nombre_cliente || rec.folder_name, rec.customer_number, rec.type)) {
            clientId = (await getClientIdsByNumbers([rec.customer_number]))[0]?.id
          }
          if (!clientId) {
            const created = await insertPendingClient({
              first_name:    '',
              last_name:     rec.nombre_cliente || rec.folder_name,
              client_number: rec.customer_number,
              status:        'prospecto',
              source:        'sharepoint',
              client_type:   rec.type,
            })
            clientId = created.id as string
            clientIdByNumber.set(rec.customer_number, clientId)
          }
          await setBancoCentralLinkedClient(rec.id, clientId!)
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`Reconciliación linked_client_id: ${msg}`)
    }

    // Completar nombre/mail/celular de los clientes de legajos a partir de la ficha
    try {
      await enrichClientsFromFichas(token, result)
    } catch (e: unknown) {
      result.errors.push(`Completar desde fichas: ${e instanceof Error ? e.message : String(e)}`)
    }

    const status = result.errors.length === 0 ? 'success' : 'partial'
    await logSync(logType, status, result, startedAt)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    result.errors.push(msg)
    await logSync(logType, 'error', result, startedAt, msg)
  }

  return result
}

// ── Sync Recursos ─────────────────────────────────────────────────────────────
// Reads: RECURSOS_DRIVE_ID / RECURSOS_FOLDER_ID
// Syncs PDFs and subfolders into `recursos` table
export async function syncResources(): Promise<SyncResult> {
  const startedAt = new Date()
  const result: SyncResult = { found: 0, created: 0, updated: 0, errors: [] }

  const driveId = process.env.RECURSOS_DRIVE_ID
  const folderId = process.env.RECURSOS_FOLDER_ID

  if (!driveId || !folderId) {
    const err = 'RECURSOS_DRIVE_ID or RECURSOS_FOLDER_ID not configured'
    result.errors.push(err)
    await logSync('recursos', 'error', result, startedAt, err)
    return result
  }

  try {
    const token = await getGraphToken()
    await syncFolderRecursive(driveId, folderId, null, token, result)
    const status = result.errors.length === 0 ? 'success' : 'partial'
    await logSync('recursos', status, result, startedAt)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    result.errors.push(msg)
    await logSync('recursos', 'error', result, startedAt, msg)
  }

  return result
}

async function syncFolderRecursive(
  driveId: string,
  folderId: string,
  category: string | null,
  token: string,
  result: SyncResult
) {
  const items = await listFolderChildren(driveId, folderId, token)

  for (const item of items) {
    if (item.folder) {
      // Use folder name as category for first level
      await syncFolderRecursive(driveId, item.id, category ?? item.name, token, result)
    } else if (item.file) {
      result.found++
      try {
        const existing = await getRecursoByItemId(item.id)

        const fields = {
          name: item.name,
          category: category ?? 'general',
          web_url: item.webUrl,
          drive_id: driveId,
          item_id: item.id,
          file_size: item.size ?? null,
          mime_type: item.file?.mimeType ?? null,
          last_modified: item.lastModifiedDateTime ?? null,
          updated_at: new Date().toISOString(),
        }

        if (existing) {
          await updateRecursoById(existing.id, fields)
          result.updated++
        } else {
          await insertRecurso(fields)
          result.created++
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`File ${item.name}: ${msg}`)
      }
    }
  }
}

// ── Sync Scoring ──────────────────────────────────────────────────────────────
// Reads: SCORING_DRIVE_ID / SCORING_FOLDER_ID
// Structure: Scoring/ > "ClientNumber - Client Name"/ > *.xlsx / *.csv
// Upserts into: scoring_files table

export async function syncScoring(): Promise<SyncResult> {
  const startedAt = new Date()
  const result: SyncResult = { found: 0, created: 0, updated: 0, errors: [] }

  const driveId  = process.env.SCORING_DRIVE_ID
  const folderId = process.env.SCORING_FOLDER_ID

  if (!driveId || !folderId) {
    const err = 'SCORING_DRIVE_ID or SCORING_FOLDER_ID not configured'
    result.errors.push(err)
    await logSync('scoring', 'error', result, startedAt, err)
    return result
  }

  const SCORING_MIME = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-excel',                                           // xls
    'text/csv',
    'text/plain',
    'application/pdf',
  ]

  try {
    const token = await getGraphToken()

    // Flat folder — all files live directly inside Scoring/ (no subfolders)
    const items = await listFolderChildren(driveId, folderId, token)
    const spreadsheets = items.filter(f =>
      f.file && (
        SCORING_MIME.includes(f.file.mimeType) ||
        /\.(xlsx|xls|csv|pdf)$/i.test(f.name)
      )
    )
    result.found = spreadsheets.length

    for (const file of spreadsheets) {
      try {
        const fields = {
          name:           file.name,
          client_folder:  null,   // no subfolder — client identified from file content
          client_id:      null,   // resolved later when the file is analyzed
          drive_id:       driveId,
          item_id:        file.id,
          web_url:        file.webUrl,
          file_size:      file.size ?? null,
          mime_type:      file.file?.mimeType ?? null,
          last_modified:  file.lastModifiedDateTime ?? null,
          last_synced_at: new Date().toISOString(),
          updated_at:     new Date().toISOString(),
        }

        const existing = await getScoringFileByItemId(file.id)

        if (existing) {
          await updateScoringFileById(existing.id, fields)
          result.updated++
        } else {
          await insertScoringFile(fields)
          result.created++
        }
      } catch (e: unknown) {
        result.errors.push(`File ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const status = result.errors.length === 0 ? 'success' : 'partial'
    await logSync('scoring', status, result, startedAt)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    result.errors.push(msg)
    await logSync('scoring', 'error', result, startedAt, msg)
  }

  return result
}

// Un cliente por persona: fusiona los pares duplicados seguros que hayan quedado.
export async function mergeSafeDuplicatesLogged() {
  try {
    const { merged, errors } = await mergeSafeDuplicates()
    if (merged > 0) console.log(`[sync] Clientes duplicados fusionados: ${merged}`)
    for (const e of errors) console.error('[sync] No se pudo fusionar duplicado:', e)
  } catch (e) {
    console.error('[sync] Error buscando clientes duplicados:', e)
  }
}

// ── Sync All ──────────────────────────────────────────────────────────────────
export async function syncAll(): Promise<Record<string, SyncResult>> {
  // Las que crean/emparejan clientes corren una detrás de otra: en paralelo
  // cada una cargaba la lista de clientes antes de que la otra terminara y no
  // se veían entre sí, así que la misma persona quedaba duplicada (uno con
  // número y otro con carpeta).
  const clientes = await Promise.allSettled([syncClients()]).then(r => r[0])
  const bcuLocal = await Promise.allSettled([syncBancoCentralLocal()]).then(r => r[0])
  const bcuInternacional = await Promise.allSettled([syncBancoCentralInternacional()]).then(r => r[0])
  const [recursos, scoring] = await Promise.allSettled([
    syncResources(),
    syncScoring(),
  ])
  await mergeSafeDuplicatesLogged()

  return {
    clientes:
      clientes.status === 'fulfilled'
        ? clientes.value
        : { found: 0, created: 0, updated: 0, errors: [String(clientes.reason)] },
    bcu_local:
      bcuLocal.status === 'fulfilled'
        ? bcuLocal.value
        : { found: 0, created: 0, updated: 0, errors: [String(bcuLocal.reason)] },
    bcu_internacional:
      bcuInternacional.status === 'fulfilled'
        ? bcuInternacional.value
        : { found: 0, created: 0, updated: 0, errors: [String(bcuInternacional.reason)] },
    recursos:
      recursos.status === 'fulfilled'
        ? recursos.value
        : { found: 0, created: 0, updated: 0, errors: [String(recursos.reason)] },
    scoring:
      scoring.status === 'fulfilled'
        ? scoring.value
        : { found: 0, created: 0, updated: 0, errors: [String(scoring.reason)] },
  }
}
