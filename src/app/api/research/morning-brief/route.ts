import { NextRequest, NextResponse } from 'next/server'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { listMorningBriefs, type MorningBriefSections } from '@/lib/db/research'
import { saveMorningBrief, buildMorningBriefFromRawText } from '@/lib/research/generateMorningBrief'
import { notifyMorningBriefPublished } from '@/lib/notifications/researchEvents'

function periodToRange(period: string | null): { from?: string; to?: string } {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d }

  switch (period) {
    case 'hoy': return { from: iso(today), to: iso(today) }
    case 'ayer': { const y = daysAgo(1); return { from: iso(y), to: iso(y) } }
    case '7d': return { from: iso(daysAgo(7)), to: iso(today) }
    case '30d': return { from: iso(daysAgo(30)), to: iso(today) }
    default: return {} // histórico — sin filtro de fecha
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period')
  const q = searchParams.get('q') ?? undefined
  const { from, to } = periodToRange(period)

  const briefs = await listMorningBriefs({ from, to, q })
  return NextResponse.json({ briefs })
}

// Creación manual, o automática desde el worker de WhatsApp (autenticado con
// un secret compartido en vez de una sesión de usuario).
export async function POST(request: NextRequest) {
  const workerSecret = request.headers.get('x-worker-secret')
  const isWorker = !!workerSecret && !!process.env.RESEARCH_WORKER_SECRET && workerSecret === process.env.RESEARCH_WORKER_SECRET

  let authorId: string | null = null
  let authorName = 'Zapia (automático)'

  if (!isWorker) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (!RESEARCH_AUTHOR_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'No tenés permiso para publicar el Morning Brief' }, { status: 403 })
    }
    authorId = session.id
    authorName = session.name
  }

  try {
    const body = await request.json() as {
      briefDate: string
      rawText?: string
      sections?: MorningBriefSections
      headlines?: string[]
    }

    if (!body.briefDate) return NextResponse.json({ error: 'briefDate es obligatorio' }, { status: 400 })

    // Camino simple: pegar el mensaje tal cual (usado por Zapia y por el
    // formulario manual) — se auto-extraen los titulares.
    let sections: MorningBriefSections
    let headlines: string[]
    if (body.rawText?.trim()) {
      const built = buildMorningBriefFromRawText(body.rawText)
      sections = built.sections
      headlines = built.headlines
    } else {
      sections = body.sections ?? {}
      headlines = body.headlines ?? []
    }

    if (headlines.length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos 1 titular' }, { status: 400 })
    }

    const post = await saveMorningBrief({
      briefDate: body.briefDate,
      sections,
      headlines,
      authorId,
      authorName,
    })

    await notifyMorningBriefPublished(post.id, body.briefDate)

    return NextResponse.json({ post }, { status: 201 })
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un Morning Brief publicado para esa fecha' }, { status: 409 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
