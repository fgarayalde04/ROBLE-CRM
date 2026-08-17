const Anthropic = require('@anthropic-ai/sdk')

const SECTION_KEYS = [
  'mercados', 'estados_unidos', 'europa', 'latam',
  'renta_fija', 'fondos', 'commodities', 'que_mirar_hoy',
]

const SYSTEM_PROMPT = `Recibís el resumen de noticias financieras que la app Zapia le envía por WhatsApp a un usuario todas las mañanas (ya generado por Zapia a partir de varios medios). Tu único trabajo es REESTRUCTURAR ese texto en el formato JSON que te piden, sin agregar información nueva, sin opinar y sin inventar nada que no esté en el texto original.

Reglas estrictas:
- No inventes cifras, nombres, fechas ni fuentes que no estén en el texto.
- No dividas en frases que cambien el sentido del original — reformulá lo mínimo indispensable para que quede prolijo.
- Si el texto no trae información para alguna sección, dejá esa sección afuera del JSON (no la inventes).
- "headlines": entre 3 y 5 titulares cortos (una línea cada uno) con lo más importante del día.
- Las secciones posibles son exactamente: mercados, estados_unidos, europa, latam, renta_fija, fondos, commodities, que_mirar_hoy.
- Para cada sección con contenido, generá un texto breve (2-5 oraciones) fiel al original.
- Devolvé ÚNICAMENTE el JSON, sin texto adicional, sin markdown.

Formato exacto:
{"headlines": ["...", "..."], "sections": {"mercados": {"text": "..."}, "estados_unidos": {"text": "..."}}}`

async function structureZapiaText(rawText) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawText }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) throw new Error('Respuesta sin texto del modelo')

  let parsed
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new Error(`No se pudo parsear la respuesta como JSON: ${textBlock.text.slice(0, 200)}`)
  }

  const headlines = Array.isArray(parsed.headlines) ? parsed.headlines.filter(Boolean) : []
  const sections = {}
  for (const key of SECTION_KEYS) {
    const text = parsed.sections?.[key]?.text
    if (text) sections[key] = { text, sources: [] }
  }

  return { headlines, sections }
}

module.exports = { structureZapiaText, SECTION_KEYS }
