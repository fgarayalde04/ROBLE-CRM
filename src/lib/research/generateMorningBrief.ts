import { createPost, type MorningBriefSections } from '@/lib/db/research'

export interface MorningBriefInput {
  briefDate: string        // 'YYYY-MM-DD'
  sections: MorningBriefSections
  headlines: string[]      // 3-5 titulares para el Panel del Día
  authorId: string | null
  authorName: string
}

// Guarda un Morning Brief ya armado (manual hoy; automatizado mañana usa el
// mismo camino). No sobrescribe el de un día ya publicado — el índice único
// (brief_date) en research_posts lo impide.
export async function saveMorningBrief(input: MorningBriefInput) {
  return createPost({
    type: 'morning_brief',
    title: `Morning Brief — ${input.briefDate}`,
    brief_date: input.briefDate,
    sections: input.sections,
    headlines: input.headlines,
    created_by: input.authorId,
    created_by_name: input.authorName,
    published_at: new Date().toISOString(),
  })
}

// Titulares numerados tipo Zapia: emoji + "*N) Título*" — solo estos cuentan
// como titular (secciones sin número, como "LATINOAMÉRICA" o "Acción para
// hoy", quedan afuera de esta lista corta).
const NUMBERED_TITLE_RE = /\*\d+\)\s*([^*]+)\*/g

function extractHeadlines(rawText: string, max = 5): string[] {
  const headlines: string[] = []
  for (const match of Array.from(rawText.matchAll(NUMBERED_TITLE_RE))) {
    const title = match[1].trim().replace(/[:\s—-]+$/, '')
    if (!title) continue
    headlines.push(title)
    if (headlines.length >= max) break
  }
  if (headlines.length === 0) {
    const firstLine = rawText.split('\n').find((l) => l.trim())
    if (firstLine) headlines.push(firstLine.trim().slice(0, 120))
  }
  return headlines
}

// Toma el mensaje de Zapia tal cual llega — no lo reescribe ni resume, solo
// separa 3-5 titulares (de sus propios títulos en negrita) para la vista
// corta del Panel del Día. El texto completo se guarda sin tocar.
export function buildMorningBriefFromRawText(rawText: string): { headlines: string[]; sections: MorningBriefSections } {
  const text = rawText.trim()
  return {
    headlines: extractHeadlines(text),
    sections: { 'Resumen del día': { text, sources: [] } },
  }
}

// Fase 2: Zapia (asistente externo del usuario) ya arma el resumen diario y
// lo envía por webhook, tal cual, sin pasar por ningún modelo de IA.
export async function generateMorningBriefFromWebhook(rawText: string, briefDate: string, source: string) {
  const { headlines, sections } = buildMorningBriefFromRawText(rawText)
  if (headlines.length === 0) throw new Error('El texto recibido no generó ningún titular')

  return saveMorningBrief({
    briefDate,
    sections,
    headlines,
    authorId: null,
    authorName: source,
  })
}
