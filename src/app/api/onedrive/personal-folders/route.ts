import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken } from '@/lib/microsoft/graph'

export const dynamic = 'force-dynamic'

// Resolve a path inside a drive to get its item ID + children
async function resolveByPath(driveId: string, path: string, token: string) {
  const encoded = encodeURIComponent(path)
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encoded}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`No se encontró la carpeta "${path}": ${await res.text()}`)
  return res.json()
}

async function listChildren(driveId: string, itemId: string, token: string) {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children?$select=id,name,webUrl,folder,lastModifiedDateTime&$top=200&$orderby=name`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Error listando carpetas: ${await res.text()}`)
  const data = await res.json()
  return (data.value ?? []) as any[]
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 403 })
    }

    const driveId = process.env.CLIENTES_DRIVE_ID
    if (!driveId) return NextResponse.json({ error: 'CLIENTES_DRIVE_ID no configurado' }, { status: 500 })

    const token  = await getGraphToken()

    // Resolve "Carpetas Personales" by path
    const root   = await resolveByPath(driveId, 'Carpetas Personales', token)
    const items  = await listChildren(driveId, root.id, token)

    const folders = items
      .filter((i: any) => i.folder)
      .map((i: any) => ({
        id:   i.id,
        name: i.name,
        webUrl: i.webUrl,
        driveId,
      }))

    return NextResponse.json({
      driveId,
      rootId:   root.id,
      rootPath: 'Carpetas Personales',
      folders,
    })
  } catch (err: any) {
    console.error('[personal-folders]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — create a new subfolder inside Carpetas Personales
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 403 })
    }

    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const driveId = process.env.CLIENTES_DRIVE_ID
    if (!driveId) return NextResponse.json({ error: 'CLIENTES_DRIVE_ID no configurado' }, { status: 500 })

    const token  = await getGraphToken()
    const root   = await resolveByPath(driveId, 'Carpetas Personales', token)

    // Create the new subfolder
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${root.id}/children`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Error creando carpeta: ${err}`)
    }
    const folder = await res.json()
    return NextResponse.json({
      id:      folder.id,
      name:    folder.name,
      webUrl:  folder.webUrl,
      driveId,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
