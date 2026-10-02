import { pool } from './pool'
import type { TipoPlantilla } from '@/lib/plantillas/tipos'

export interface PlantillaDoc {
  id: string
  tipo: TipoPlantilla
  titulo: string
  datos: any
  created_by: string | null
  created_by_id: string | null
  updated_by: string | null
  research_type: string | null
  research_post_id: string | null
  research_publicado_at: string | null
  web_publicar: boolean
  web_report_id: string | null
  web_file_path: string | null
  web_publicado_at: string | null
  created_at: string
  updated_at: string
}

export async function listPlantillas(): Promise<Omit<PlantillaDoc, 'datos'>[]> {
  const { rows } = await pool.query(
    `select id, tipo, titulo, created_by, created_by_id, updated_by, research_type, research_post_id, research_publicado_at,
            web_publicar, web_report_id, web_publicado_at, created_at, updated_at
       from plantillas_documentos order by updated_at desc limit 300`
  )
  return rows
}

export async function getPlantilla(id: string): Promise<PlantillaDoc | null> {
  const { rows } = await pool.query(`select * from plantillas_documentos where id = $1`, [id])
  return rows[0] ?? null
}

export async function createPlantilla(input: {
  tipo: TipoPlantilla; titulo: string; datos: unknown; userName: string; userId: string | null
  researchType?: string | null; webPublicar?: boolean
}) {
  const { rows } = await pool.query(
    `insert into plantillas_documentos (tipo, titulo, datos, created_by, created_by_id, updated_by, research_type, web_publicar)
     values ($1, $2, $3::jsonb, $4, $5, $4, $6, $7) returning *`,
    [input.tipo, input.titulo, JSON.stringify(input.datos ?? {}), input.userName, input.userId, input.researchType ?? null, !!input.webPublicar]
  )
  return rows[0] as PlantillaDoc
}

/** Borrador automático del mes (YYYY-MM) para un tipo, si ya se creó. */
export async function getPlantillaAuto(tipo: TipoPlantilla, periodo: string): Promise<PlantillaDoc | null> {
  const { rows } = await pool.query(
    `select * from plantillas_documentos where tipo = $1 and auto_periodo = $2`,
    [tipo, periodo]
  )
  return rows[0] ?? null
}

/** Crea el borrador automático del mes; si otro proceso lo creó justo antes, devuelve null. */
export async function createPlantillaAuto(input: {
  tipo: TipoPlantilla; periodo: string; titulo: string; datos: unknown; researchType: string | null
}): Promise<PlantillaDoc | null> {
  const { rows } = await pool.query(
    `insert into plantillas_documentos (tipo, titulo, datos, created_by, updated_by, research_type, web_publicar, auto_periodo)
     values ($1, $2, $3::jsonb, 'Automático', 'Automático', $4, false, $5)
     on conflict (tipo, auto_periodo) where auto_periodo is not null do nothing
     returning *`,
    [input.tipo, input.titulo, JSON.stringify(input.datos ?? {}), input.researchType, input.periodo]
  )
  return rows[0] ?? null
}

export async function updatePlantilla(id: string, input: { titulo: string; datos: unknown; userName: string }) {
  const { rows } = await pool.query(
    `update plantillas_documentos set titulo = $2, datos = $3::jsonb, updated_by = $4, updated_at = now()
      where id = $1 returning *`,
    [id, input.titulo, JSON.stringify(input.datos ?? {}), input.userName]
  )
  return (rows[0] as PlantillaDoc) ?? null
}

export async function setResearchType(id: string, researchType: string | null) {
  await pool.query(`update plantillas_documentos set research_type = $2 where id = $1`, [id, researchType])
}

export async function setResearchPublicado(id: string, postId: string) {
  await pool.query(
    `update plantillas_documentos set research_post_id = $2, research_publicado_at = now() where id = $1`,
    [id, postId]
  )
}

export async function setWebPublicar(id: string, publicar: boolean) {
  await pool.query(`update plantillas_documentos set web_publicar = $2 where id = $1`, [id, publicar])
}

export async function setWebPublicado(id: string, reportId: string, filePath: string) {
  await pool.query(
    `update plantillas_documentos set web_report_id = $2, web_file_path = $3, web_publicado_at = now() where id = $1`,
    [id, reportId, filePath]
  )
}

export async function deletePlantilla(id: string) {
  await pool.query(`delete from plantillas_documentos where id = $1`, [id])
}
