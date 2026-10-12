import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { markOpeningAccountOpened, markClientAccountOpened } from '@/lib/db/openings'

// POST /api/openings/mark-opened — { opening_id } o { client_id }.
// Marca la cuenta como abierta: apertura → cuenta_abierta y cliente → activo.
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { opening_id, client_id } = await req.json()
    if (opening_id) await markOpeningAccountOpened(opening_id)
    else if (client_id) await markClientAccountOpened(client_id)
    else return NextResponse.json({ error: 'Falta opening_id o client_id' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
