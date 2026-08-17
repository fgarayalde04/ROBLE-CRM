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

/**
 * Orquestación pensada para la generación automática del Morning Brief:
 *
 *   FUENTES DE NOTICIAS
 *     ↓ fetchArticles()      — traer artículos recientes de cada fuente configurada
 *   ELIMINAR DUPLICADOS
 *     ↓ dedupeArticles()     — agrupar notas del mismo tema entre distintos medios
 *   CLASIFICAR POR RELEVANCIA
 *     ↓ classifyArticles()   — asignar cada grupo a una sección del brief
 *   ENVIAR AL MODELO DE IA
 *     ↓ summarizeWithAI()    — generar el resumen ejecutivo por sección, citando fuentes
 *   GUARDAR
 *     ↓ saveMorningBrief()   — persistir en research_posts
 *   PUBLICAR
 *     ↓ notifyMorningBriefPublished() — notificación interna, sin push
 *
 * Fase 1 (actual): no hay proveedor de noticias ni de IA conectado — esta
 * función existe para que el resto del sistema (API, UI, notificaciones) ya
 * tenga un único punto de entrada estable cuando se conecte la automatización,
 * sin tener que tocar nada fuera de este archivo.
 */
export async function generateMorningBrief(): Promise<never> {
  throw new Error(
    'generateMorningBrief() todavía no está conectado a un proveedor de noticias/IA. ' +
    'Usá la creación manual (POST /api/research/morning-brief) mientras tanto.'
  )
}
