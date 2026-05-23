import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken, getGoogleEmail } from '@/lib/google/tokens'
import { createDraft } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { to, cc, subject, body } = await req.json()
  if (!subject || !body) {
    return NextResponse.json({ error: 'subject y body son requeridos' }, { status: 400 })
  }

  const accessToken = await getValidGoogleToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'Conectá tu cuenta Google para crear borradores.' }, { status: 403 })
  }
  const senderEmail = await getGoogleEmail()
  if (!senderEmail) {
    return NextResponse.json({ error: 'No se pudo obtener el email del remitente.' }, { status: 403 })
  }

  try {
    const draft = await createDraft(accessToken, { from: senderEmail, to: to || '', cc, subject, body })
    return NextResponse.json({ ok: true, draft_id: draft.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
