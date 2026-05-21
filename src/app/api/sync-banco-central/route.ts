import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  return NextResponse.json({
    cundry_path: process.env.LEGAJOS_CUNDRY_PATH ?? null,
    genelie_path: process.env.LEGAJOS_GENELIE_PATH ?? null,
  })
}

async function listSubdirs(parentPath: string): Promise<{ name: string; path: string }[]> {
  try {
    const entries = await readdir(parentPath)
    const result: { name: string; path: string }[] = []
    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('~$')) continue
      const fullPath = join(parentPath, entry)
      try {
        const s = await stat(fullPath)
        if (s.isDirectory()) result.push({ name: entry, path: fullPath })
      } catch {}
    }
    return result
  } catch {
    return []
  }
}

/** "1234 - Juan Pérez" → "1234"  |  "Juan Pérez" → null */
function extractCustomerNumber(folderName: string): string | null {
  const match = folderName.match(/^(\d+)\s*-\s*/)
  return match ? match[1].trim() : null
}

export async function POST() {
  const cundryPath = process.env.LEGAJOS_CUNDRY_PATH
  const geneliePath = process.env.LEGAJOS_GENELIE_PATH

  if (!cundryPath && !geneliePath) {
    return NextResponse.json(
      { error: 'LEGAJOS_CUNDRY_PATH y LEGAJOS_GENELIE_PATH no están configurados' },
      { status: 400 },
    )
  }

  type SyncResult = { found: number; created: number; skipped: number; errors: number }
  const results: Record<string, SyncResult | { error: string }> = {}

  async function syncFolder(folderPath: string, type: 'local' | 'internacional', key: string) {
    try {
      const s = await stat(folderPath)
      if (!s.isDirectory()) { results[key] = { error: 'La ruta no es una carpeta' }; return }
    } catch {
      results[key] = { error: `No se puede acceder a: ${folderPath}` }; return
    }

    const dirs = await listSubdirs(folderPath)
    if (dirs.length === 0) { results[key] = { found: 0, created: 0, skipped: 0, errors: 0 }; return }

    // 1. Qué paths ya existen
    const allPaths = dirs.map((d) => d.path)
    const existingPaths = new Set<string>()
    const CHUNK = 500
    for (let i = 0; i < allPaths.length; i += CHUNK) {
      const { data } = await supabaseAdmin
        .from('banco_central_records')
        .select('folder_path')
        .in('folder_path', allPaths.slice(i, i + CHUNK))
      for (const r of data ?? []) existingPaths.add(r.folder_path as string)
    }

    // 2. Solo los nuevos
    const newDirs = dirs.filter((d) => !existingPaths.has(d.path))
    const skipped = dirs.length - newDirs.length
    if (newDirs.length === 0) { results[key] = { found: dirs.length, created: 0, skipped, errors: 0 }; return }

    const rows = newDirs.map((d) => ({
      customer_number:    extractCustomerNumber(d.name),
      folder_name:        d.name,
      folder_path:        d.path,
      type,
      ficha:              false,
      lista_verificacion: false,
      cuestionario:       false,
      ci:                 false,
      cumplo:             false,
      documentos_legales: false,
      status:             'incompleto',
    }))

    // 3. Batch insert
    let created = 0, errors = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { data, error } = await supabaseAdmin
        .from('banco_central_records')
        .insert(rows.slice(i, i + CHUNK))
        .select('id')
      if (error) errors += rows.slice(i, i + CHUNK).length
      else created += (data ?? []).length
    }

    results[key] = { found: dirs.length, created, skipped, errors }
  }

  if (cundryPath)  await syncFolder(cundryPath,  'local',          'cundry')
  if (geneliePath) await syncFolder(geneliePath, 'internacional',  'genelie')

  return NextResponse.json({ results })
}
