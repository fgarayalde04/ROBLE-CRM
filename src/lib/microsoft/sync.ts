import {
  insertOpeningChecklistItems, insertSyncLog,
  getKnownClientsForSync, getKnownOpeningItemIds,
  updateClientSharePointFieldsByItemId, updateClientSharePointFieldsById,
  insertPendingClient, insertAccountOpeningStub,
  getBancoCentralByItemIds, getBancoCentralWithCustomerNumberByType,
  bulkInsertBancoCentralRecords, updateBancoCentralRecordById,
  getRecursoByItemId, insertRecurso, updateRecursoById,
  getScoringFileByItemId, insertScoringFile, updateScoringFileById,
} from '@/lib/db/sync'
import { getGraphToken, listFolderChildren, DriveItem } from './graph'

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
  try {
    const [existingClients, existingOpeningItemIds] = await Promise.all([
      getKnownClientsForSync(),
      getKnownOpeningItemIds(),
    ])
    for (const c of existingClients ?? []) {
      if (c.item_id) knownClientIds.add(c.item_id)
      if (c.client_number) clientByNumber.set(c.client_number, c.id)
    }
    for (const itemId of existingOpeningItemIds ?? []) knownOpeningIds.add(itemId)
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

            // ── 2. Already in account_openings → skip (no duplicates) ──
            if (knownOpeningIds.has(itemId)) {
              continue
            }

            // ── 3. Existing client matched by client_number → link item_id ──
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

            // ── 4. Truly new folder → Apertura de Cuenta + stub client with status='pendiente' ──
            {
              const now = new Date().toISOString()

              // 1. Create pendiente client so it shows in the clients list
              let newClient: { id: string } | null = null
              try {
                newClient = await insertPendingClient({
                  first_name: '',
                  last_name: displayName,
                  client_number: clientNumber,
                  status: 'pendiente',
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
    const [byItemIdRows, byCustomerRows] = await Promise.all([
      getBancoCentralByItemIds(allItemIds),
      getBancoCentralWithCustomerNumberByType(bcuType),
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

    const now = new Date().toISOString()
    const toInsert: Record<string, unknown>[] = []
    const toUpdate: { id: string; fields: Record<string, unknown> }[] = []

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

// ── Sync All ──────────────────────────────────────────────────────────────────
export async function syncAll(): Promise<Record<string, SyncResult>> {
  const [clientes, bcuLocal, bcuInternacional, recursos, scoring] = await Promise.allSettled([
    syncClients(),
    syncBancoCentralLocal(),
    syncBancoCentralInternacional(),
    syncResources(),
    syncScoring(),
  ])

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
