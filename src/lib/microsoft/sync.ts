import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGraphToken, listFolderChildren, DriveItem } from './graph'

export interface SyncResult {
  found: number
  created: number
  updated: number
  errors: string[]
}

// The advisor subfolders to look for under Clientes/
const ADVISOR_FOLDERS = ['Francisco', 'Guillermo', 'Sandra', 'Ines', 'Javier', 'Fernando - Federico']

async function logSync(
  syncType: string,
  status: 'success' | 'error' | 'partial',
  result: SyncResult,
  startedAt: Date,
  message?: string
) {
  await supabaseAdmin.from('sync_logs').insert({
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
// Structure: Clientes/ > AdvisorName/ > "ClientNumber - Client Name"/
// Upserts into: clients table (source='sharepoint', drive_id, item_id, web_url, etc.)

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

  try {
    const token = await getGraphToken()

    // List top-level advisor folders
    const advisorFolders = await listFolderChildren(driveId, folderId, token)
    const targetAdvisors = advisorFolders.filter(
      f =>
        f.folder &&
        ADVISOR_FOLDERS.some(a => f.name.toLowerCase().includes(a.toLowerCase()))
    )

    for (const advisorFolder of targetAdvisors) {
      const advisorName = advisorFolder.name
      try {
        const clientFolders = await listFolderChildren(driveId, advisorFolder.id, token)
        const onlyFolders = clientFolders.filter(f => f.folder)
        result.found += onlyFolders.length

        for (const clientFolder of onlyFolders) {
          try {
            // Parse "12345 - LASTNAME FIRSTNAME" or "LASTNAME, FIRSTNAME"
            const folderName = clientFolder.name.trim()
            let clientNumber: string | null = null
            let firstName = ''
            let lastName = ''

            const numMatch = folderName.match(/^(\d+)\s*[-–]\s*(.+)/)
            if (numMatch) {
              clientNumber = numMatch[1]
              const namePart = numMatch[2].trim()
              const parts = namePart.split(/\s+/)
              lastName = parts[0] ?? ''
              firstName = parts.slice(1).join(' ')
            } else {
              const commaMatch = folderName.match(/^([^,]+),\s*(.+)/)
              if (commaMatch) {
                lastName = commaMatch[1].trim()
                firstName = commaMatch[2].trim()
              } else {
                const parts = folderName.split(/\s+/)
                lastName = parts[0] ?? folderName
                firstName = parts.slice(1).join(' ')
              }
            }

            const spFields = {
              source: 'sharepoint',
              drive_id: driveId,
              item_id: clientFolder.id,
              web_url: clientFolder.webUrl,
              parent_path: advisorName,
              last_synced_at: new Date().toISOString(),
              advisor: advisorName,
            }

            // Try to match by client_number, then item_id, then folder_name (manual entries)
            let existing: { id: string } | null = null
            if (clientNumber) {
              const { data } = await supabaseAdmin
                .from('clients')
                .select('id')
                .eq('client_number', clientNumber)
                .maybeSingle()
              existing = data
            }
            if (!existing) {
              const { data } = await supabaseAdmin
                .from('clients')
                .select('id')
                .eq('item_id', clientFolder.id)
                .maybeSingle()
              existing = data
            }
            // Last resort: match via account_openings.folder_name (handles manually-entered clients)
            if (!existing) {
              const { data: opening } = await supabaseAdmin
                .from('account_openings')
                .select('client_id')
                .ilike('folder_name', folderName)
                .not('client_id', 'is', null)
                .maybeSingle()
              if (opening?.client_id) {
                const { data } = await supabaseAdmin
                  .from('clients')
                  .select('id')
                  .eq('id', opening.client_id)
                  .maybeSingle()
                existing = data
              }
            }

            if (existing) {
              await supabaseAdmin.from('clients').update(spFields).eq('id', existing.id)
              result.updated++
            } else {
              const { data: newClient } = await supabaseAdmin
                .from('clients')
                .insert({
                  first_name: firstName || folderName,
                  last_name: lastName,
                  client_number: clientNumber,
                  status: 'activo',
                  ...spFields,
                })
                .select('id')
                .maybeSingle()
              result.created++
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            result.errors.push(`Client folder ${clientFolder.name}: ${msg}`)
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

    for (const folder of onlyFolders) {
      try {
        const folderName = folder.name.trim()
        // Parse customer number from "1234567 - NAME" format
        const numMatch = folderName.match(/^(\d+)\s*[-–]\s*(.*)/)
        const customerNumber = numMatch?.[1] ?? null

        const spFields = {
          drive_id: driveId,
          item_id: folder.id,
          web_url: folder.webUrl,
          parent_path: folder.parentReference?.path ?? null,
          last_synced_at: new Date().toISOString(),
        }

        // Match by customer_number or item_id
        let existing: { id: string } | null = null
        if (customerNumber) {
          const { data } = await supabaseAdmin
            .from('banco_central_records')
            .select('id')
            .eq('customer_number', customerNumber)
            .eq('type', bcuType)
            .maybeSingle()
          existing = data
        }
        if (!existing) {
          const { data } = await supabaseAdmin
            .from('banco_central_records')
            .select('id')
            .eq('item_id', folder.id)
            .maybeSingle()
          existing = data
        }

        if (existing) {
          await supabaseAdmin
            .from('banco_central_records')
            .update(spFields)
            .eq('id', existing.id)
          result.updated++
        } else {
          await supabaseAdmin.from('banco_central_records').insert({
            customer_number: customerNumber ?? folderName,
            folder_name: folderName,
            type: bcuType,
            ...spFields,
          })
          result.created++
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        result.errors.push(`Folder ${folder.name}: ${msg}`)
      }
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
        const { data: existing } = await supabaseAdmin
          .from('recursos')
          .select('id')
          .eq('item_id', item.id)
          .maybeSingle()

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
          await supabaseAdmin.from('recursos').update(fields).eq('id', existing.id)
          result.updated++
        } else {
          await supabaseAdmin.from('recursos').insert(fields)
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

        const { data: existing } = await supabaseAdmin
          .from('scoring_files')
          .select('id')
          .eq('item_id', file.id)
          .maybeSingle()

        if (existing) {
          await supabaseAdmin.from('scoring_files').update(fields).eq('id', existing.id)
          result.updated++
        } else {
          await supabaseAdmin.from('scoring_files').insert(fields)
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
