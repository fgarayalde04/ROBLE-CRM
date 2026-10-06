import type { ResearchType } from '@/lib/db/research'

// Nombres de las categorías (tipos) de Research & Novedades que se pueden
// elegir al publicar a mano o desde Plantillas. Sin morning_brief, que tiene su propio circuito.
export const RESEARCH_CATEGORIAS: { value: ResearchType; label: string }[] = [
  { value: 'nueva_emision', label: 'Nueva emisión' },
  { value: 'bono', label: 'Bono' },
  { value: 'fondo', label: 'Fondo' },
  { value: 'research', label: 'Research' },
  { value: 'noticia_mercado', label: 'Mercado' },
  { value: 'macro', label: 'Macroeconomía' },
  { value: 'regulacion', label: 'Regulación' },
  { value: 'novedad_interna', label: 'Novedad interna' },
  { value: 'comite_inversiones', label: 'Comité de Inversiones' },
]

export function isResearchCategoria(v: unknown): v is ResearchType {
  return RESEARCH_CATEGORIAS.some((c) => c.value === v)
}

export function researchCategoriaLabel(v: string | null | undefined) {
  return RESEARCH_CATEGORIAS.find((c) => c.value === v)?.label ?? v ?? ''
}
