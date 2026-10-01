import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { pool } from '@/lib/db/pool'
import { getPlantilla } from '@/lib/db/plantillas'
import { logActivity } from '@/lib/db/activityLog'
import { getValidSharedGoogleToken, INVERSIONES_GOOGLE_CONNECTION_KEY } from '@/lib/google/tokens'
import { sendEmail } from '@/lib/google/gmail'
import { generarPdfPlantilla, nombreArchivo } from '@/lib/plantillas/pdf'
import { camposFaltantes } from '@/lib/plantillas/tipos'

export const maxDuration = 120

// Sale desde inversiones@ (casilla conectada en Configuración). Gmail limita
// destinatarios por mensaje: se manda en tandas, cada una con los clientes en
// copia oculta e inversiones@ como único destinatario visible.
const POR_TANDA = 50
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/plantillas/[id]/enviar { clientIds: string[], asunto, cuerpo }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Sin permiso para enviar a clientes' }, { status: 403 })

  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  const faltan = camposFaltantes(doc.tipo, doc.datos)
  if (faltan.length) return NextResponse.json({ error: `Faltan completar: ${faltan.join(', ')}` }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.clientIds) ? body.clientIds.map(String) : []
  const asunto = String(body.asunto ?? '').trim()
  const cuerpo = String(body.cuerpo ?? '').trim()
  if (!ids.length) return NextResponse.json({ error: 'Elegí al menos un cliente' }, { status: 400 })
  if (!asunto || !cuerpo) return NextResponse.json({ error: 'Falta el asunto o el texto del mail' }, { status: 400 })

  const { rows } = await pool.query(
    `select id, trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) as nombre, lower(trim(email)) as email
       from clients where id = any($1::uuid[])`,
    [ids]
  )
  const vistos = new Set<string>()
  const destinatarios = rows.filter((r) => EMAIL_RE.test(r.email ?? '') && !vistos.has(r.email) && vistos.add(r.email))
  if (!destinatarios.length) return NextResponse.json({ error: 'Ninguno de los clientes elegidos tiene un mail válido' }, { status: 400 })

  const token = await getValidSharedGoogleToken(INVERSIONES_GOOGLE_CONNECTION_KEY)
  if (!token) return NextResponse.json({ error: 'La casilla inversiones@roblecapital.net no está conectada (Configuración → Casilla de Inversiones)' }, { status: 400 })

  let pdf: Buffer
  try {
    pdf = await generarPdfPlantilla(doc.id, doc.tipo, session)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const from = `"${process.env.PLANTILLAS_FROM_NAME ?? 'Roble Capital'}" <${INVERSIONES_GOOGLE_CONNECTION_KEY}>`
  const enviados: typeof destinatarios = []
  let error: string | null = null
  for (let i = 0; i < destinatarios.length; i += POR_TANDA) {
    const tanda = destinatarios.slice(i, i + POR_TANDA)
    try {
      await sendEmail(token, {
        from,
        to: INVERSIONES_GOOGLE_CONNECTION_KEY,
        bcc: tanda.map((d) => d.email),
        subject: asunto,
        body: cuerpo,
        attachments: [{ filename: nombreArchivo(doc.titulo), contentType: 'application/pdf', content: pdf }],
      })
      enviados.push(...tanda)
    } catch (err: any) {
      console.error('[plantillas/enviar] tanda', i / POR_TANDA + 1, err.message)
      error = err.message
      break
    }
  }

  if (enviados.length) {
    await pool.query(
      `insert into plantillas_envios (documento_id, titulo, asunto, destinatarios, cantidad, enviado_por, enviado_por_id)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [doc.id, doc.titulo, asunto, JSON.stringify(enviados.map((d) => ({ client_id: d.id, nombre: d.nombre, email: d.email }))), enviados.length, session.name, session.id]
    )
    // Queda en el historial de cada cliente (ficha 360).
    await Promise.all(enviados.map((d) => logActivity({
      entity_type: 'client', entity_id: d.id, action: 'email_enviado',
      description: `Email enviado (copia oculta): ${asunto} — ${doc.titulo}.pdf`, user_name: session.name,
    }).catch(() => {})))
  }

  if (error) {
    return NextResponse.json({
      error: `Se enviaron ${enviados.length} de ${destinatarios.length}. Falló el resto: ${error}`, enviados: enviados.length,
    }, { status: enviados.length ? 207 : 500 })
  }
  return NextResponse.json({ ok: true, enviados: enviados.length, omitidos: ids.length - destinatarios.length })
}
