import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getPost } from '@/lib/db/research'
import { resendMorningBriefPush } from '@/lib/notifications/researchEvents'

// POST /api/research/[id]/resend-push — reenvía el push del Morning Brief
// (la notificación interna ya existe; esto es para el caso en que el push no
// haya llegado a los dispositivos la primera vez).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'No tenés permiso para esta acción' }, { status: 403 })
  }

  const post = await getPost(params.id)
  if (!post) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (post.type !== 'morning_brief') {
    return NextResponse.json({ error: 'Solo aplica a publicaciones de Morning Brief' }, { status: 400 })
  }

  const result = await resendMorningBriefPush(post.id, post.brief_date ?? post.published_at?.slice(0, 10))
  return NextResponse.json({ ok: true, ...result })
}
