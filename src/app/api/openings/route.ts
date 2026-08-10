import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { createOpening, updateOpening, getOpeningRaw, deleteOpening } from '@/lib/db/openings'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const data = await createOpening(payload)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { id, ...payload } = await req.json()

    // When "Comenzar" is clicked (status → recolectando_informacion):
    // If the opening doesn't have a client yet, create one from the stored folder data.
    if (payload.status === 'recolectando_informacion') {
      const opening = await getOpeningRaw(id)

      if (!opening.client_id && opening.item_id) {
        const folderName: string = opening.folder_name ?? ''
        let clientNumber: string | null = null
        let displayName = folderName
        const numMatch = folderName.match(/^(\d+)\s*[-–]\s*(.+)/)
        if (numMatch) {
          clientNumber = numMatch[1]
          displayName = numMatch[2].trim()
        }

        const { rows: existingRows } = await pool.query(
          `select id from clients where item_id = $1`,
          [opening.item_id]
        )
        let clientId = existingRows[0]?.id ?? null

        if (!clientId) {
          const { rows: newClientRows } = await pool.query(
            `insert into clients (first_name, last_name, client_number, status, source, drive_id, item_id, web_url, onedrive_folder_url, advisor, last_synced_at)
             values ('', $1, $2, 'activo', 'sharepoint', $3, $4, $5, $6, $7, now())
             returning id`,
            [
              displayName,
              clientNumber,
              opening.drive_id,
              opening.item_id,
              opening.web_url ?? opening.onedrive_url,
              opening.onedrive_url ?? opening.web_url,
              opening.advisor,
            ]
          )
          clientId = newClientRows[0].id
        } else {
          await pool.query(
            `update clients set status = 'activo', drive_id = $1, web_url = $2, onedrive_folder_url = $3, advisor = $4, updated_at = now(), last_synced_at = now()
             where id = $5`,
            [opening.drive_id, opening.web_url ?? opening.onedrive_url, opening.onedrive_url ?? opening.web_url, opening.advisor, clientId]
          )
        }

        payload.client_id = clientId
      } else if (opening.client_id) {
        await pool.query(
          `update clients set status = 'activo', drive_id = $1, web_url = $2, onedrive_folder_url = $3, advisor = $4, updated_at = now(), last_synced_at = now()
           where id = $5`,
          [opening.drive_id, opening.web_url ?? opening.onedrive_url, opening.onedrive_url ?? opening.web_url, opening.advisor, opening.client_id]
        )
      }

      const now = new Date().toISOString()
      payload.status = 'cuenta_abierta'
      payload.opened_date = now.split('T')[0]
      payload.account_opened_at = now
    }

    const data = await updateOpening(id, payload)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await deleteOpening(id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
