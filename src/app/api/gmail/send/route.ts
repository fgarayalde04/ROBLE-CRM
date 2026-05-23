import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getValidGoogleToken, getGoogleEmail } from '@/lib/google/tokens'
import { sendEmail } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { to, cc, subject, body } = await req.json()
  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'to, subject y body son requeridos' }, { status: 400 })
  }

  const accessToken = await getValidGoogleToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'Conectá tu cuenta Google para enviar emails.' }, { status: 403 })
  }
  const senderEmail = await getGoogleEmail()
  if (!senderEmail) {
    return NextResponse.json({ error: 'No se pudo obtener el email del remitente.' }, { status: 403 })
  }

  try {
    const message = await sendEmail(accessToken, { from: senderEmail, to, cc, subject, body })

    const toStr = Array.isArray(to) ? to.join(', ') : to
    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'system',
      entity_id:   null,
      action:      'email_enviado',
      description: `Plantilla enviada a ${toStr}: ${subject}`,
      created_by:  session.name,
    })

    return NextResponse.json({ ok: true, message_id: message.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
