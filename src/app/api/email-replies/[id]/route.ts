import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getEmailReplyAsesorId, setEmailReplyReviewed } from '@/lib/db/emailReplies'

export const dynamic = 'force-dynamic'

const MESA_ROLES = ['admin', 'ceo', 'direccion', 'mesa', 'asistente']

// PATCH /api/email-replies/:id  { reviewed: boolean } — marcar una respuesta
// como revisada (o volverla a pendiente). Mesa puede con todas; un asesor solo
// con las de sus órdenes.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const reply = await getEmailReplyAsesorId(params.id)
  if (!reply.exists) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const isMesa = MESA_ROLES.includes(session.role)
  const isOwner = reply.asesorId ? reply.asesorId === session.id : reply.asesor === session.name
  if (!isMesa && !isOwner) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { reviewed } = await req.json()
  await setEmailReplyReviewed(params.id, reviewed ? session.name : null)
  return NextResponse.json({ ok: true })
}
