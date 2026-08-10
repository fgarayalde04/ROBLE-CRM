import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { findAuthorizedEmailForUse, bumpAuthorizedEmailUsage } from '@/lib/db/authorizedEmails'

export const dynamic = 'force-dynamic'

// POST /api/authorized-emails/use
// Body: { email, numero_cliente }
// Bumps ultima_utilizacion + cantidad_utilizaciones
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { email, numero_cliente } = await req.json()
  if (!email) return NextResponse.json({ ok: false })

  // Find the record
  const data = await findAuthorizedEmailForUse(email.toLowerCase().trim(), numero_cliente ?? null)
  if (!data) return NextResponse.json({ ok: false })

  await bumpAuthorizedEmailUsage(data.id, (data.cantidad_utilizaciones ?? 0) + 1)

  return NextResponse.json({ ok: true })
}
