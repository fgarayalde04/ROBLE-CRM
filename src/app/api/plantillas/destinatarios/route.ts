import { NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

// GET /api/plantillas/destinatarios — clientes con mail, para elegir a quién
// mandar un documento (el filtro por asesor/perfil/estado se hace en pantalla).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const { rows } = await pool.query(
    `select id, trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) as nombre, lower(trim(email)) as email,
            client_number, advisor, risk_profile, status
       from clients
      where email is not null and trim(email) like '%@%' and coalesce(status, '') not in ('descartado')
      order by first_name, last_name`
  )
  return NextResponse.json({ clientes: rows })
}
