import { NextResponse } from 'next/server'
import { linkClientForOpening } from '@/lib/db/clientLinks'
import { pool } from '@/lib/db/pool'
import { createOpening, updateOpening, getOpeningRaw, deleteOpening } from '@/lib/db/openings'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    // Un cliente no puede tener dos aperturas en curso: si ya hay una, se devuelve esa.
    if (payload.client_id) {
      const { rows } = await pool.query(
        `select * from account_openings where client_id = $1 and status not in ('cuenta_abierta', 'descartado') order by created_at desc limit 1`,
        [payload.client_id]
      )
      if (rows[0]) return NextResponse.json({ ...rows[0], already_existed: true })
    }
    const data = await createOpening(payload)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { id, ...payload } = await req.json()
    let link: Awaited<ReturnType<typeof linkClientForOpening>> | null = null

    // When "Comenzar" is clicked (status → recolectando_informacion):
    // If the opening doesn't have a client yet, create one from the stored folder data.
    // La apertura queda en curso (recolectando_informacion) y el cliente sigue
    // pendiente: pasan a "Cuenta abierta"/Activo recién al terminar el checklist
    // (TabResumen). Antes Comenzar las marcaba abiertas de entrada, sin paso a paso.
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
             values ('', $1, $2, 'prospecto', 'sharepoint', $3, $4, $5, $6, $7, now())
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
            `update clients set drive_id = coalesce($1, drive_id), web_url = coalesce($2, web_url), onedrive_folder_url = coalesce($3, onedrive_folder_url), advisor = coalesce($4, advisor), updated_at = now(), last_synced_at = now()
             where id = $5`,
            [opening.drive_id, opening.web_url ?? opening.onedrive_url, opening.onedrive_url ?? opening.web_url, opening.advisor, clientId]
          )
        }

        payload.client_id = clientId
      } else if (opening.client_id) {
        await pool.query(
          `update clients set drive_id = coalesce($1, drive_id), web_url = coalesce($2, web_url), onedrive_folder_url = coalesce($3, onedrive_folder_url), advisor = coalesce($4, advisor), updated_at = now(), last_synced_at = now()
           where id = $5`,
          [opening.drive_id, opening.web_url ?? opening.onedrive_url, opening.onedrive_url ?? opening.web_url, opening.advisor, opening.client_id]
        )
      }

      // Que el cliente quede siempre vinculado: número de Banco Central,
      // legajo de Banco Central y carpeta de OneDrive.
      const linkedClientId = payload.client_id ?? opening.client_id
      link = linkedClientId
        ? await linkClientForOpening(id, linkedClientId)
        : { client_number: null, banco_central: false, folder: false, missing: ['cliente'] }
    }

    const data = await updateOpening(id, payload)
    return NextResponse.json(link ? { ...data, link } : data)
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
