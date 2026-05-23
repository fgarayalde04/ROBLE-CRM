import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken } from '@/lib/microsoft/graph'

// GET /api/sync/discover
// Resolves the folder IDs needed for .env.local

const DRIVE_ID = 'b!aTSFpSK92Um6YYsAqz9YFjGaLyDtHONPmppHgP21BNaU45R76oWjTrziGzmAvO4k'

async function resolvePath(path: string, token: string) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encoded}?$select=id,name,webUrl`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return { error: `${res.status}: ${await res.text()}` }
  const data = await res.json()
  return { id: data.id, name: data.name, webUrl: data.webUrl }
}

async function listChildren(folderId: string, token: string) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}/children?$select=id,name,webUrl,folder&$top=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const data = await res.json()
  return (data.value ?? []).filter((i: any) => i.folder).map((i: any) => ({ id: i.id, name: i.name }))
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const token = await getGraphToken()
    const result: Record<string, any> = { drive_id: DRIVE_ID }

    // Resolve each needed path directly
    const paths: Record<string, string> = {
      'Clientes': 'Clientes',
      'Roble Capital WM SA': 'Roble Capital WM SA',
      'Geliene International SA': 'Geliene International SA',
      'Operaciones': 'Operaciones',
      'Productos': 'Productos',
      'Scoring': 'Operaciones/Scoring',
    }

    result.root_folders = {}
    for (const [key, path] of Object.entries(paths)) {
      result.root_folders[key] = await resolvePath(path, token)
    }

    // Drill into Roble Capital WM SA to find BCU / Legajos Cundry
    const rcwmId = result.root_folders['Roble Capital WM SA']?.id
    if (rcwmId) {
      const rcwmChildren = await listChildren(rcwmId, token)
      result.roble_capital_wm_subfolders = rcwmChildren

      // Find BCU folder
      const bcuFolder = rcwmChildren.find((f: any) => f.name.toLowerCase().includes('bcu'))
      if (bcuFolder) {
        result.bcu_folder = bcuFolder
        const bcuChildren = await listChildren(bcuFolder.id, token)
        result.bcu_subfolders = bcuChildren

        // Find Legajos Cundry folder
        const legajosCundry = bcuChildren.find((f: any) =>
          f.name.toLowerCase().includes('legajos') && f.name.toLowerCase().includes('cundry')
        )
        if (legajosCundry) {
          result.legajos_cundry_parent = legajosCundry
          const cundryChildren = await listChildren(legajosCundry.id, token)
          result.legajos_cundry_subfolders = cundryChildren
          const finalCundry = cundryChildren.find((f: any) => f.name.toLowerCase().includes('legajos cundry') || f.name.toLowerCase() === 'legajos cundry')
          result.LEGAJOS_CUNDRY_FOLDER_ID = finalCundry ?? legajosCundry
        } else {
          // Maybe the legajos are directly inside BCU
          result.LEGAJOS_CUNDRY_FOLDER_ID = bcuChildren.find((f: any) => f.name.toLowerCase().includes('legajo'))
        }
      }
    }

    // Drill into Geliene International SA to find Legajos Geliene
    const gelieneId = result.root_folders['Geliene International SA']?.id
    if (gelieneId) {
      const gelieneChildren = await listChildren(gelieneId, token)
      result.geliene_subfolders = gelieneChildren
      const legajesGeliene = gelieneChildren.find((f: any) => f.name.toLowerCase().includes('legajo'))
      result.LEGAJOS_GELIENE_FOLDER_ID = legajesGeliene ?? null
    }

    // Drill into Operaciones to find Recursos or similar
    const opId = result.root_folders['Operaciones']?.id
    if (opId) {
      const opChildren = await listChildren(opId, token)
      result.operaciones_subfolders = opChildren
    }

    // Drill into Productos (often has fund docs / recursos)
    const prodId = result.root_folders['Productos']?.id
    if (prodId) {
      const prodChildren = await listChildren(prodId, token)
      result.productos_subfolders = prodChildren
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
