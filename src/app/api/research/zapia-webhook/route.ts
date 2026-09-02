import { NextRequest, NextResponse } from 'next/server'
import { generateMorningBriefFromWebhook } from '@/lib/research/generateMorningBrief'
import { notifyMorningBriefPublished } from '@/lib/notifications/researchEvents'

// POST /api/research/zapia-webhook — Zapia (o cualquier fuente externa) envía
// el resumen diario ya armado (texto libre); se guarda tal cual como Morning
// Brief, solo se extraen titulares. Autenticado con un secret compartido.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const expected = process.env.ZAPIA_WEBHOOK_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json() as { summary?: string; date?: string }
    if (!body.summary?.trim()) {
      return NextResponse.json({ error: 'summary es obligatorio' }, { status: 400 })
    }
    const briefDate = body.date || new Date().toISOString().slice(0, 10)

    const post = await generateMorningBriefFromWebhook(body.summary, briefDate, 'Zapia (automático)')

    // La notificación es best-effort: si falla, el brief ya quedó guardado y
    // debe responderse 201 igual. Si esto rechazara, Zapia vería un 500 pese
    // a que el contenido se guardó, reintentaría, y el reintento chocaría con
    // el brief ya existente (un solo post por día) sin volver a notificar a
    // nadie — así fallaba en silencio el push aunque el brief sí se publicara.
    try {
      await notifyMorningBriefPublished(post.id, briefDate)
    } catch (err) {
      console.error('[zapia-webhook] notify failed', err)
    }

    return NextResponse.json({ ok: true, postId: post.id }, { status: 201 })
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un Morning Brief publicado para esa fecha' }, { status: 409 })
    }
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
