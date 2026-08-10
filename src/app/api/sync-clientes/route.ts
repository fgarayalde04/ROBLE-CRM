import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { getClientsWithOnedriveFolder } from '@/lib/db/clients'
import { getAllOpeningOnedriveUrls, createOpening } from '@/lib/db/openings'

export async function GET() {
  return NextResponse.json({ clients_folder: process.env.CLIENTS_FOLDER_PATH ?? null })
}

function parseClientFolder(folderName: string): {
  client_number: string | null
  first_name: string
  last_name: string
} {
  const match = folderName.match(/^(\d+)\s*-\s*(.+)$/)
  if (match) {
    const client_number = match[1].trim()
    const namePart = match[2].trim()
    const parts = namePart.split(/\s+/)
    return { client_number, first_name: parts[0] ?? namePart, last_name: parts.slice(1).join(' ') || parts[0] }
  }
  // "LASTNAME, FIRSTNAME" format
  const commaMatch = folderName.match(/^([^,]+),\s*(.+)$/)
  if (commaMatch) {
    return { client_number: null, first_name: commaMatch[2].trim(), last_name: commaMatch[1].trim() }
  }
  // Plain name
  const parts = folderName.trim().split(/\s+/)
  return { client_number: null, first_name: parts[0] ?? folderName, last_name: parts.slice(1).join(' ') || parts[0] }
}

async function listSubdirs(parentPath: string): Promise<string[]> {
  try {
    const entries = await readdir(parentPath)
    const result: string[] = []
    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('~$')) continue
      const fullPath = join(parentPath, entry)
      try {
        const s = await stat(fullPath)
        if (s.isDirectory()) result.push(entry)
      } catch {}
    }
    return result
  } catch {
    return []
  }
}

export async function POST() {
  const clientsFolder = process.env.CLIENTS_FOLDER_PATH
  if (!clientsFolder) {
    return NextResponse.json({ error: 'CLIENTS_FOLDER_PATH no está configurado' }, { status: 400 })
  }

  try {
    const s = await stat(clientsFolder)
    if (!s.isDirectory()) {
      return NextResponse.json({ error: `La ruta no es una carpeta: ${clientsFolder}` }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: `No se puede acceder a: ${clientsFolder}` }, { status: 400 })
  }

  // ── 1. Read filesystem (advisor → clients) ──────────────────────────────
  // Only process folders belonging to known Roble Capital advisors.
  // Any other folder (Prodigy, etc.) is completely ignored.
  const ALLOWED_ADVISORS = [
    'Francisco',
    'Javier',
    'Sandra',
    'Ines',
    'Guillermo',
    'Federico-Fernando',
  ]

  const advisorNames = (await listSubdirs(clientsFolder)).filter((name) =>
    ALLOWED_ADVISORS.some((allowed) => name.toLowerCase() === allowed.toLowerCase())
  )

  type FolderEntry = { advisor: string; name: string; path: string }
  const allFolders: FolderEntry[] = []

  for (const advisor of advisorNames) {
    const clientNames = await listSubdirs(join(clientsFolder, advisor))
    for (const name of clientNames) {
      allFolders.push({ advisor, name, path: join(clientsFolder, advisor, name) })
    }
  }

  if (allFolders.length === 0) {
    return NextResponse.json({ total_found: 0, created: 0, duplicates: 0, errors: 0, advisors: [] })
  }

  // ── 2. Find already-linked folders (native Postgres — no URL length limit) ──
  const existingClients = await getClientsWithOnedriveFolder()
  const existingPaths = new Set<string>()
  for (const c of existingClients) if (c.onedrive_folder_url) existingPaths.add(c.onedrive_folder_url)

  // ── 3. Also check already-tracked openings to avoid double-inserting ──────
  const existingOpeningUrls = await getAllOpeningOnedriveUrls()
  const existingOpeningPaths = new Set(existingOpeningUrls)

  // ── 4. Filter to only new folders (not yet in clients OR openings) ────────
  const newFolders = allFolders.filter(
    (f) => !existingPaths.has(f.path) && !existingOpeningPaths.has(f.path)
  )
  const duplicates = allFolders.length - newFolders.length

  if (newFolders.length === 0) {
    return NextResponse.json({
      total_found: allFolders.length,
      created: 0,
      duplicates,
      errors: 0,
      advisors: advisorNames.map((a) => ({
        name: a,
        count: allFolders.filter((f) => f.advisor === a).length,
      })),
    })
  }

  // ── 5. New folders → Apertura de Cuentas (account_openings) ──────────────
  //    These are genuinely new clients added after the initial sync.
  //    They enter the opening workflow starting at 'carpeta_creada'.
  const today = new Date().toISOString().split('T')[0]

  const openingRows = newFolders.map((folder) => ({
    folder_name: folder.name,
    onedrive_url: folder.path,
    advisor: folder.advisor,
    status: 'carpeta_creada',
    priority: 'normal',
    start_date: today,
  }))

  let createdCount = 0
  let errors = 0

  for (const row of openingRows) {
    try {
      await createOpening(row)
      createdCount++
    } catch {
      errors++
    }
  }

  return NextResponse.json({
    total_found: allFolders.length,
    created: createdCount,
    duplicates,
    errors,
    advisors: advisorNames.map((a) => ({
      name: a,
      count: allFolders.filter((f) => f.advisor === a).length,
    })),
  })
}
