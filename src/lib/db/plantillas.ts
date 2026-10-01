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
  created_at: string
  updated_at: string
}

export async function listPlantillas(): Promise<Omit<PlantillaDoc, 'datos'>[]> {
  const { rows } = await pool.query(
    `select id, tipo, titulo, created_by, created_by_id, updated_by, research_type, research_post_id, research_publicado_at,
            created_at, updated_at
       from plantillas_documentos order by updated_at desc limit 300`
  )
  return rows
}

export async function getPlantilla(id: string): Promise<PlantillaDoc | null> {
  const { rows } = await pool.query(`select * from plantillas_documentos where id = $1`, [id])
  return rows[0] ?? null
}

export async function createPlantilla(input: {
  tipo: TipoPlantilla; titulo: string; datos: unknown; userName: string; userId: string; researchType?: string | null
}) {
  const { rows } = await pool.query(
    `insert into plantillas_documentos (tipo, titulo, datos, created_by, created_by_id, updated_by, research_type)
     values ($1, $2, $3::jsonb, $4, $5, $4, $6) returning *`,
    [input.tipo, input.titulo, JSON.stringify(input.datos ?? {}), input.userName, input.userId, input.researchType ?? null]
  )
  return rows[0] as PlantillaDoc
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

export async function deletePlantilla(id: string) {
  await pool.query(`delete from plantillas_documentos where id = $1`, [id])
}
