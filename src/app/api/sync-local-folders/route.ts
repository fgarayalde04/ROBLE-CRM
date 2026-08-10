import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { getClientsByOnedriveUrls, createClientFromRecord } from '@/lib/db/clients'
import { createOpening } from '@/lib/db/openings'

export async function GET() {
  const folderPath = process.env.LOCAL_CLIENTS_FOLDER_PATH ?? null
  return NextResponse.json({ folder_path: folderPath })
}

function parseName(folderName: string): { first_name: string; last_name: string } {
  const parts = folderName.trim().split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] }
  const first_name = parts[0]
  const last_name = parts.slice(1).join(' ')
  return { first_name, last_name }
}

function generateClientNumber(name: string): string {
  const slug = name.replace(/\s+/g, '').slice(0, 4).toUpperCase()
  const num = Date.now().toString().slice(-4)
  return `CLI-${slug}-${num}`
}

export async function POST() {
  const folderPath = process.env.LOCAL_CLIENTS_FOLDER_PATH
  if (!folderPath) {
    return NextResponse.json(
      { error: 'LOCAL_CLIENTS_FOLDER_PATH no esta configurado en .env.local' },
      { status: 400 }
    )
  }

  try {
    const s = await stat(folderPath)
    if (!s.isDirectory()) {
      return NextResponse.json({ error: `La ruta no es una carpeta: ${folderPath}` }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: `No se puede acceder a: ${folderPath}` }, { status: 400 })
  }

  // Leer subcarpetas
  const entries = await readdir(folderPath)
  const dirs: { name: string; path: string }[] = []
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const fullPath = join(folderPath, entry)
    try {
      const s = await stat(fullPath)
      if (s.isDirectory()) dirs.push({ name: entry, path: fullPath })
    } catch {}
  }

  if (dirs.length === 0) {
    return NextResponse.json({
      total_found: 0, created: 0, duplicates: 0, errors: 0,
      all_folders: [], folder_path: folderPath,
    })
  }

  // Buscar clientes ya existentes por folder_path
  const paths = dirs.map((d) => d.path)
  const existing = await getClientsByOnedriveUrls(paths)

  const existingPaths = new Set((existing ?? []).map((e: any) => e.onedrive_folder_url as string))

  let created = 0
  let errors = 0

  for (const dir of dirs) {
    if (existingPaths.has(dir.path)) continue

    const { first_name, last_name } = parseName(dir.name)

    // Insert client
    let clientData
    try {
      clientData = await createClientFromRecord({
        client_number: generateClientNumber(dir.name),
        first_name,
        last_name,
        status: 'prospecto',
        client_type: 'local',
        onedrive_folder_url: dir.path,
        notes: `Detectado automaticamente desde carpeta local: ${dir.path}`,
      })
    } catch {
      errors++
      continue
    }

    // Create account opening for the new client (inserts default checklist too)
    try {
      await createOpening({
        client_id: clientData.id,
        folder_name: dir.name,
        status: 'carpeta_creada',
        priority: 'normal',
        start_date: new Date().toISOString().split('T')[0],
        source: 'local_folder',
        folder_path: dir.path,
      })
    } catch { /* client was still created */ }

    created++
  }

  return NextResponse.json({
    total_found: dirs.length,
    created,
    duplicates: dirs.length - dirs.filter((d) => !existingPaths.has(d.path)).length,
    errors,
    all_folders: dirs.map((d) => ({ name: d.name, is_new: !existingPaths.has(d.path) })),
    folder_path: folderPath,
  })
}
