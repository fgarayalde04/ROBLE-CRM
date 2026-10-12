import { pool } from '@/lib/db/pool'
import type { PositionsBook } from '@/lib/icheAcciones/db'

export interface PlanillaInfo {
  book: PositionsBook
  href: string
  title: string
  description: string
}

const DEFAULTS: PlanillaInfo[] = [
  { book: 'iche', href: '/admin/planillas/iche-acciones', title: 'Iche Acciones', description: 'Actualización mensual — cliente Isaac Shcolnik' },
  { book: 'albojer', href: '/admin/planillas/albojer', title: 'Análisis Albojer', description: 'Actualización mensual — De Bellis (Pershing ROJ900554)' },
]

export const PLANILLA_BOOKS = DEFAULTS.map(d => d.book)

// Título/descripción editados (planillas_settings) sobre los defaults. Si la
// tabla todavía no existe en el ambiente, quedan los defaults.
export async function getPlanillas(): Promise<PlanillaInfo[]> {
  try {
    const { rows } = await pool.query<{ book: PositionsBook; title: string; description: string | null }>(
      `select book, title, description from planillas_settings`
    )
    return DEFAULTS.map(d => {
      const r = rows.find(x => x.book === d.book)
      return r ? { ...d, title: r.title, description: r.description ?? '' } : d
    })
  } catch {
    return DEFAULTS
  }
}

export async function getPlanilla(book: PositionsBook): Promise<PlanillaInfo> {
  return (await getPlanillas()).find(p => p.book === book)!
}

export async function savePlanilla(book: PositionsBook, title: string, description: string): Promise<void> {
  await pool.query(
    `insert into planillas_settings (book, title, description, updated_at) values ($1, $2, $3, now())
     on conflict (book) do update set title = excluded.title, description = excluded.description, updated_at = now()`,
    [book, title, description || null]
  )
}
