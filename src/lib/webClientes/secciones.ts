import { TIPOS_PLANTILLA, type TipoPlantilla } from '@/lib/plantillas/tipos'

export interface SeccionWeb { section: string; subsection: string }

// Secciones de research de la web de clientes. Deben coincidir con
// backend/app/core/research_sections.py del repo RobleCapital.
export const SECCIONES_WEB: (SeccionWeb & { label: string })[] = [
  { section: 'renta-fija', subsection: 'nuevas-emisiones', label: 'Renta Fija · Nuevas emisiones' },
  { section: 'renta-fija', subsection: 'analisis-bonos', label: 'Renta Fija · Análisis de bonos' },
  { section: 'mas-operado', subsection: 'bonos', label: 'Lo Más Operado · Bonos' },
  { section: 'mas-operado', subsection: 'fondos', label: 'Lo Más Operado · Fondos' },
  { section: 'comite-inversiones', subsection: 'comentarios', label: 'Comité de Inversiones' },
  { section: 'comparativos', subsection: 'bonos', label: 'Comparativos · Bonos' },
  { section: 'comparativos', subsection: 'fondos', label: 'Comparativos · Fondos' },
]

export function esSeccionWeb(section: unknown, subsection: unknown): boolean {
  return SECCIONES_WEB.some((s) => s.section === section && s.subsection === subsection)
}

// Documentos que vienen de Plantillas: la sección de la web la define el tipo
// de plantilla (ficha de bono → Nuevas emisiones, comparativo → Comparativos, …).
export function seccionWebDePlantilla(tipo: string | null | undefined): SeccionWeb | null {
  if (!tipo || !Object.prototype.hasOwnProperty.call(TIPOS_PLANTILLA, tipo)) return null
  return TIPOS_PLANTILLA[tipo as TipoPlantilla].web
}

// Sección sugerida según la categoría de Research & Novedades (null = elegir a mano).
export function seccionWebSugerida(type: string): SeccionWeb | null {
  if (type === 'nueva_emision') return { section: 'renta-fija', subsection: 'nuevas-emisiones' }
  if (type === 'bono') return { section: 'renta-fija', subsection: 'analisis-bonos' }
  if (type === 'comite_inversiones') return { section: 'comite-inversiones', subsection: 'comentarios' }
  return null
}

// Comité de Inversiones: va el PDF que arma el equipo y, además, el comentario
// del comité escrito en texto (se ve en la web debajo del título).
export function requiereComentario(section: unknown) {
  return section === 'comite-inversiones'
}

/** Texto que acompaña al PDF en la web: el resumen y el desarrollo (comentario). */
export function textoParaWeb(post: { summary?: string | null; body?: string | null }, conDesarrollo: boolean) {
  const partes = [post.summary, conDesarrollo ? post.body : null].map((t) => (t ?? '').trim()).filter(Boolean)
  return partes.length ? partes.join('\n\n') : null
}
