import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { supabaseAdmin } from '@/lib/supabase/admin'

const DEFAULT_CHECKLIST = [
  { title: 'Ficha de cliente hecha', sort_order: 0 },
  { title: 'Cedulas conseguidas', sort_order: 1 },
  { title: 'Comprobante de domicilio recibido', sort_order: 2 },
  { title: 'Informacion de madre/padre completa', sort_order: 3 },
  { title: 'Perfil de riesgo completado', sort_order: 4 },
  { title: 'Formularios enviados al cliente', sort_order: 5 },
  { title: 'Formularios firmados recibidos', sort_order: 6 },
  { title: 'Documentacion revisada internamente', sort_order: 7 },
  { title: 'Documentacion enviada al banco', sort_order: 8 },
  { title: 'Confirmacion del banco recibida', sort_order: 9 },
  { title: 'Numero de cliente asignado', sort_order: 10 },
  { title: 'Cuenta marcada como activa', sort_order: 11 },
]

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
  const { data: existing } = await supabaseAdmin
    .from('clients')
    .select('onedrive_folder_url')
    .in('onedrive_folder_url', paths)

  const existingPaths = new Set((existing ?? []).map((e: any) => e.onedrive_folder_url as string))

  let created = 0
  let errors = 0

  for (const dir of dirs) {
    if (existingPaths.has(dir.path)) continue

    const { first_name, last_name } = parseName(dir.name)

    // Insert client
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .insert({
        client_number: generateClientNumber(dir.name),
        first_name,
        last_name,
        status: 'prospecto',
        client_type: 'local',
        onedrive_folder_url: dir.path,
        notes: `Detectado automaticamente desde carpeta local: ${dir.path}`,
      })
      .select()
      .single()

    if (clientError || !clientData) {
      errors++
      continue
    }

    // Create account opening for the new client
    const { data: openingData, error: openingError } = await supabaseAdmin
      .from('account_openings')
      .insert({
        client_id: clientData.id,
        folder_name: dir.name,
        status: 'carpeta_creada',
        priority: 'normal',
        start_date: new Date().toISOString().split('T')[0],
        source: 'local_folder',
        folder_path: dir.path,
      })
      .select()
      .single()

    if (!openingError && openingData) {
      // Insert default checklist for the opening
      const checklistRows = DEFAULT_CHECKLIST.map((item) => ({
        opening_id: openingData.id,
        title: item.title,
        sort_order: item.sort_order,
      }))
      await supabaseAdmin.from('opening_checklist_items').insert(checklistRows)
    }

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
