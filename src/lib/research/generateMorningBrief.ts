import Anthropic from '@anthropic-ai/sdk'
import { createPost, type MorningBriefSections } from '@/lib/db/research'

const SECTION_KEYS = [
  'mercados', 'estados_unidos', 'europa', 'latam',
  'renta_fija', 'fondos', 'commodities', 'que_mirar_hoy',
] as const

const STRUCTURE_SYSTEM_PROMPT = `Recibís el resumen diario de mercados que genera Zapia (un asistente que ya lee noticias y correos financieros del usuario). Tu único trabajo es REESTRUCTURAR ese texto en el formato JSON pedido, sin agregar información nueva, sin opinar y sin inventar nada que no esté en el texto original.

Reglas estrictas:
- No inventes cifras, nombres, fechas ni fuentes que no estén en el texto.
- No cambies el sentido — reformulá lo mínimo indispensable para que quede prolijo.
- Si el texto no trae información para alguna sección, dejá esa sección afuera del JSON (no la inventes).
- "headlines": entre 3 y 5 titulares cortos (una línea cada uno) con lo más importante.
- Las secciones posibles son exactamente: mercados, estados_unidos, europa, latam, renta_fija, fondos, commodities, que_mirar_hoy.
- Para cada sección con contenido, generá un texto breve (2-5 oraciones) fiel al original.
- Devolvé ÚNICAMENTE el JSON, sin texto adicional, sin markdown.

Formato exacto:
{"headlines": ["...", "..."], "sections": {"mercados": {"text": "..."}, "estados_unidos": {"text": "..."}}}`

// Reestructura un resumen de texto libre (de Zapia u otra fuente) en el formato
// de secciones del Morning Brief. No busca noticias por su cuenta — solo
// reformatea el texto que ya recibió.
export async function structureBriefText(rawText: string): Promise<{ headlines: string[]; sections: MorningBriefSections }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada')

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: STRUCTURE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawText }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Respuesta sin texto del modelo')

  let parsed: any
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new Error(`No se pudo parsear la respuesta como JSON: ${textBlock.text.slice(0, 200)}`)
  }

  const headlines: string[] = Array.isArray(parsed.headlines) ? parsed.headlines.filter(Boolean) : []
  const sections: MorningBriefSections = {}
  for (const key of SECTION_KEYS) {
    const text = parsed.sections?.[key]?.text
    if (text) sections[key] = { text, sources: [] }
  }

  return { headlines, sections }
}

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

// Fase 2: Zapia (asistente externo del usuario) ya arma el resumen diario a
// partir de sus correos y noticias, y lo envía por webhook. Este es el único
// punto de entrada que usa ese webhook — reestructura el texto y lo guarda.
export async function generateMorningBriefFromWebhook(rawText: string, briefDate: string, source: string) {
  const { headlines, sections } = await structureBriefText(rawText)
  if (headlines.length === 0) throw new Error('El texto recibido no generó ningún titular')

  return saveMorningBrief({
    briefDate,
    sections,
    headlines,
    authorId: null,
    authorName: source,
  })
}
