import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
    return result.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  } catch {
    return []
  }
}

export async function GET() {
  const clientsFolder = process.env.CLIENTS_FOLDER_PATH
  if (!clientsFolder) {
    return NextResponse.json({ error: 'CLIENTS_FOLDER_PATH no configurado' }, { status: 400 })
  }

  // Read advisor-level folders — only known Roble Capital advisors
  const ALLOWED_ADVISORS = ['Francisco', 'Javier', 'Sandra', 'Ines', 'Guillermo', 'Federico-Fernando']
  const advisorNames = (await listSubdirs(clientsFolder)).filter((name) =>
    ALLOWED_ADVISORS.some((a) => a.toLowerCase() === name.toLowerCase())
  )

  // For each advisor, read client folders
  const advisorFolders: { advisor: string; folderPath: string; clients: { name: string; path: string }[] }[] = []

  for (const advisor of advisorNames) {
    const advisorPath = join(clientsFolder, advisor)
    const clientNames = await listSubdirs(advisorPath)
    advisorFolders.push({
      advisor,
      folderPath: advisorPath,
      clients: clientNames.map((name) => ({
        name,
        path: join(advisorPath, name),
      })),
    })
  }

  // Fetch ALL clients that have a folder path — match in memory to avoid URL length limits
  // with large .in() queries (389 long paths would exceed PostgREST URL limits)
  const linkedMap = new Map<string, { id: string; first_name: string; last_name: string; client_number: string; status: string }>()

  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: batch } = await supabaseAdmin
      .from('clients')
      .select('id, first_name, last_name, client_number, onedrive_folder_url, status')
      .not('onedrive_folder_url', 'is', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (!batch || batch.length === 0) break
    for (const c of batch) {
      if (c.onedrive_folder_url) linkedMap.set(c.onedrive_folder_url, c)
    }
    if (batch.length < PAGE_SIZE) break
    page++
  }

  // Build response
  const result = advisorFolders.map((a) => ({
    advisor: a.advisor,
    total: a.clients.length,
    linked: a.clients.filter((c) => linkedMap.has(c.path)).length,
    clients: a.clients.map((c) => {
      const crm = linkedMap.get(c.path) ?? null
      return {
        folder_name: c.name,
        folder_path: c.path,
        linked: !!crm,
        crm_id: crm?.id ?? null,
        crm_name: crm ? `${crm.first_name} ${crm.last_name}` : null,
        crm_number: crm?.client_number ?? null,
        crm_status: crm?.status ?? null,
      }
    }),
  }))

  const totalFolders = advisorFolders.reduce((sum, a) => sum + a.clients.length, 0)
  const totalLinked = result.reduce((sum, a) => sum + a.linked, 0)

  return NextResponse.json({
    advisors: result,
    summary: {
      total_folders: totalFolders,
      total_linked: totalLinked,
      total_unlinked: totalFolders - totalLinked,
    },
  })
}
