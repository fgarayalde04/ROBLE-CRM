import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSeeMenuKey } from '@/lib/auth/menu'
import { PLANILLA_BOOKS, savePlanilla } from '@/lib/planillas/settings'
import type { PositionsBook } from '@/lib/icheAcciones/db'

// PUT { book, title, description } — renombra una planilla.
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session || !canSeeMenuKey(session.role, 'menu_planillas', session.permissions)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { book, title, description } = await req.json()
  if (!PLANILLA_BOOKS.includes(book)) return NextResponse.json({ error: 'Planilla inválida' }, { status: 400 })
  const t = String(title ?? '').trim()
  if (!t || t.length > 80) return NextResponse.json({ error: 'El nombre tiene que tener entre 1 y 80 caracteres' }, { status: 400 })
  await savePlanilla(book as PositionsBook, t, String(description ?? '').trim().slice(0, 160))
  return NextResponse.json({ ok: true })
}
