import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
  let query = supabaseAdmin
    .from('client_authorized_emails')
    .select('id, cantidad_utilizaciones')
    .eq('email', email.toLowerCase().trim())
    .eq('autorizado', true)

  if (numero_cliente) query = query.eq('numero_cliente', numero_cliente)

  const { data } = await query.maybeSingle()
  if (!data) return NextResponse.json({ ok: false })

  await supabaseAdmin
    .from('client_authorized_emails')
    .update({
      ultima_utilizacion:     new Date().toISOString(),
      cantidad_utilizaciones: (data.cantidad_utilizaciones ?? 0) + 1,
    })
    .eq('id', data.id)

  return NextResponse.json({ ok: true })
}
