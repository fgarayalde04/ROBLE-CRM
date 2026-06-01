import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getDriveItem, getGraphToken } from '@/lib/microsoft/graph'
import { getValidAccessToken } from '@/lib/microsoft/tokens'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { driveId, itemId, webUrl } = await req.json()

    if (driveId && itemId) {
      const token = (await getValidAccessToken()) ?? (await getGraphToken())
      const item = await getDriveItem(driveId, itemId, token)
      if (!item.webUrl) return NextResponse.json({ error: 'La carpeta no tiene webUrl' }, { status: 404 })
      return NextResponse.json({ webUrl: item.webUrl })
    }

    if (typeof webUrl === 'string' && webUrl.startsWith('https://')) {
      return NextResponse.json({ webUrl })
    }

    return NextResponse.json({ error: 'Faltan driveId/itemId o webUrl OneDrive' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
