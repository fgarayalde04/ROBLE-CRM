import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getValidGoogleToken, getGoogleEmail } from '@/lib/google/tokens'
import { sendEmail } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

/**
 * POST /api/gmail
 * Send an email via the user's connected Gmail account.
 * Also saves a record in activity_log for audit trail.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { to, cc, subject, text, client_id } = body as {
    to: string | string[]
    cc?: string | string[]
    subject: string
    text: string
    client_id?: string
  }

  if (!to || !subject || !text) {
    return NextResponse.json(
      { error: 'to, subject y text son requeridos' },
      { status: 400 }
    )
  }

  // ── 1. Require Google connection ────────────────────────────────────────────
  const accessToken = await getValidGoogleToken()
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Conectá tu cuenta Google para enviar emails. Ir a Configuración.' },
      { status: 403 }
    )
  }

  const senderEmail = await getGoogleEmail()
  if (!senderEmail) {
    return NextResponse.json(
      { error: 'No se pudo obtener el email del remitente. Reconectá Google.' },
      { status: 403 }
    )
  }

  // ── 2. Send via Gmail ───────────────────────────────────────────────────────
  try {
    const message = await sendEmail(accessToken, {
      from: senderEmail,
      to,
      cc,
      subject,
      body: text,
    })

    // ── 3. Save record to activity_log ──────────────────────────────────────
    const toStr = Array.isArray(to) ? to.join(', ') : to
    await supabaseAdmin.from('activity_log').insert({
      entity_type: client_id ? 'client' : 'system',
      entity_id:   client_id ?? null,
      action:      'email_enviado',
      description: `Email enviado a ${toStr}: ${subject}`,
      created_by:  session.name,
    })

    return NextResponse.json({
      ok: true,
      message_id: message.id,
      thread_id:  message.threadId,
      from:       senderEmail,
    })
  } catch (err: any) {
    console.error('[api/gmail POST]', err.message)
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
