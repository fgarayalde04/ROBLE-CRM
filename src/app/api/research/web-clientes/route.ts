import { NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { listarClientesWeb, webClientesConfigurada } from '@/lib/webClientes/client'

export const dynamic = 'force-dynamic'

// GET /api/research/web-clientes — clientes de la web a los que se puede avisar
// por mail al publicar. { clientes: null } = la web todavía no lo permite.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'No tenés permiso para esta acción' }, { status: 403 })
  }
  if (!webClientesConfigurada()) return NextResponse.json({ clientes: null })
  try {
    return NextResponse.json({ clientes: await listarClientesWeb() })
  } catch (err: any) {
    console.error('[research/web-clientes]', err.message)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
