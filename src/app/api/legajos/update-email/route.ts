import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { updateBancoCentralAuthorizedEmail } from '@/lib/db/bancoCentral'

// POST /api/legajos/update-email
// Asocia un email ingresado manualmente al legajo del cliente (banco_central_records)
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { legajo_id, email } = await req.json()
  if (!legajo_id || !email) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  try {
    await updateBancoCentralAuthorizedEmail(legajo_id, email)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
