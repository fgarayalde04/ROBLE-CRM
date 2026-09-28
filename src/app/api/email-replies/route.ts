import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listEmailRepliesInbox } from '@/lib/db/emailReplies'

export const dynamic = 'force-dynamic'

const MESA_ROLES = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']

// GET /api/email-replies?pendientes=1 — bandeja de respuestas de clientes a
// los mails de orden. Mesa ve todas; un asesor solo las de sus órdenes.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isMesa = MESA_ROLES.includes(session.role)
  const rows = await listEmailRepliesInbox({
    soloAsesor: isMesa ? null : { id: session.id, name: session.name },
    pendientes: req.nextUrl.searchParams.get('pendientes') === '1',
    limit: 200,
  })
  return NextResponse.json({ rows })
}
