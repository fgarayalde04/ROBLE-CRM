import { NextResponse } from 'next/server'
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

export async function POST(req: Request) {
  try {
    const payload = await req.json()

    const insertPayload = {
      status: 'carpeta_creada',
      priority: 'normal',
      ...payload,
    }

    const { data, error } = await supabaseAdmin
      .from('account_openings')
      .insert(insertPayload)
      .select()
      .single()
    if (error) throw error

    const checklistRows = DEFAULT_CHECKLIST.map((item) => ({
      opening_id: data.id,
      title: item.title,
      sort_order: item.sort_order,
    }))
    await supabaseAdmin.from('opening_checklist_items').insert(checklistRows)

    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'opening',
      entity_id: data.id,
      action: 'crear',
      description: `Apertura iniciada: ${data.folder_name ?? ''}`,
    })

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
      const { data: opening, error: fetchErr } = await supabaseAdmin
        .from('account_openings')
        .select('client_id, folder_name, advisor, item_id, drive_id, web_url, onedrive_url')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      if (!opening.client_id && opening.item_id) {
        const folderName: string = opening.folder_name ?? ''
        let clientNumber: string | null = null
        let displayName = folderName
        const numMatch = folderName.match(/^(\d+)\s*[-–]\s*(.+)/)
        if (numMatch) {
          clientNumber = numMatch[1]
          displayName = numMatch[2].trim()
        }

        const { data: existingClient, error: existingClientErr } = await supabaseAdmin
          .from('clients')
          .select('id')
          .eq('item_id', opening.item_id)
          .maybeSingle()

        if (existingClientErr) throw existingClientErr

        let clientId = existingClient?.id ?? null

        if (!clientId) {
          const { data: newClient, error: clientErr } = await supabaseAdmin
            .from('clients')
            .insert({
              first_name: '',
              last_name: displayName,
              client_number: clientNumber,
              status: 'activo',
              source: 'sharepoint',
              drive_id: opening.drive_id,
              item_id: opening.item_id,
              web_url: opening.web_url ?? opening.onedrive_url,
              onedrive_folder_url: opening.onedrive_url ?? opening.web_url,
              advisor: opening.advisor,
              last_synced_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (clientErr) throw clientErr
          clientId = newClient.id
        } else {
          await supabaseAdmin
            .from('clients')
            .update({
              status: 'activo',
              drive_id: opening.drive_id,
              web_url: opening.web_url ?? opening.onedrive_url,
              onedrive_folder_url: opening.onedrive_url ?? opening.web_url,
              advisor: opening.advisor,
              updated_at: new Date().toISOString(),
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', clientId)
        }

        payload.client_id = clientId
      } else if (opening.client_id) {
        await supabaseAdmin
          .from('clients')
          .update({
            status: 'activo',
            drive_id: opening.drive_id,
            web_url: opening.web_url ?? opening.onedrive_url,
            onedrive_folder_url: opening.onedrive_url ?? opening.web_url,
            advisor: opening.advisor,
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', opening.client_id)
      }

      const now = new Date().toISOString()
      payload.status = 'cuenta_abierta'
      payload.opened_date = now.split('T')[0]
      payload.account_opened_at = now
    }

    const { data, error } = await supabaseAdmin
      .from('account_openings')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    // Cascade: delete checklist items, tasks, notes, documents first
    await Promise.all([
      supabaseAdmin.from('opening_checklist_items').delete().eq('opening_id', id),
      supabaseAdmin.from('opening_tasks').delete().eq('opening_id', id),
      supabaseAdmin.from('opening_notes').delete().eq('opening_id', id),
      supabaseAdmin.from('opening_documents').delete().eq('opening_id', id),
    ])
    const { error } = await supabaseAdmin.from('account_openings').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
