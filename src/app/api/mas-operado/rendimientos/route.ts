import { NextRequest, NextResponse } from 'next/server'
import { getSession, isAdminRole, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getRankingMasOperado } from '@/lib/db/masOperado'
import { getSyncState, markSyncAttempt } from '@/lib/db/fundMonitor'
import { buscarEnDavinci } from '@/lib/plantillas/datosAuto'
import { esFechaIso } from '@/lib/masOperado/periodos'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/mas-operado/rendimientos { desde, hasta, limite } — búsqueda puntual
// en Davinci de los rendimientos que faltan en los primeros fondos comprados y
// vendidos del período. Usa la misma búsqueda que Propuestas (una sesión, un
// login, lo encontrado queda guardado) y se puede disparar una vez cada 30
// minutos, para no repetir logins (Davinci bloquea la cuenta).
const KEY = 'mas_operado_manual'
const ESPERA_MS = 30 * 60 * 1000

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!isAdminRole(session.role) && !RESEARCH_AUTHOR_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const { desde, hasta } = body
  const limite = Math.max(1, Math.min(Number(body.limite) || 10, 15))
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  }

  const estado = await getSyncState(KEY)
  if (estado.last_attempt_at && Date.now() - estado.last_attempt_at.getTime() < ESPERA_MS) {
    return NextResponse.json({ error: 'Ya se buscó hace menos de 30 minutos. Esperá un rato para no bloquear la cuenta de Davinci.' }, { status: 429 })
  }

  const ranking = await getRankingMasOperado(desde, hasta, limite)
  const vistos = new Set<string>()
  const faltan = [...ranking.fondos.compras, ...ranking.fondos.ventas].filter((f) => {
    if (vistos.has(f.key)) return false
    vistos.add(f.key)
    return !f.rendimientos || f.rendimientos.vencido
  })
  if (!faltan.length) return NextResponse.json({ buscados: 0, encontrados: [], sinDatos: [] })

  await markSyncAttempt(KEY, false)
  const encontrados: string[] = []
  const sinDatos: string[] = []
  for (const f of faltan) {
    const r = await buscarEnDavinci(f)
    if (r === undefined) {
      return NextResponse.json({ error: 'Davinci no está disponible ahora (sin credenciales o en pausa tras un error).', encontrados, sinDatos }, { status: 503 })
    }
    if (r) encontrados.push(f.nombre); else sinDatos.push(f.nombre)
  }
  await markSyncAttempt(KEY, true)
  return NextResponse.json({ buscados: faltan.length, encontrados, sinDatos })
}
