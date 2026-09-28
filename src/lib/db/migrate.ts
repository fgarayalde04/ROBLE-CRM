import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { pool } from './pool'

// Aplica al arrancar los .sql de supabase/migrations que todavía no corrieron en
// esta base (los registra en schema_migrations). Así dev y prod terminan con el
// mismo esquema: lo que se prueba en develop corre solo en producción al mergear
// a main. Las migraciones tienen que ser idempotentes (IF NOT EXISTS, etc.).
export async function runPendingMigrations() {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock(727001)')
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`
    )
    const applied = new Set(
      (await client.query('select name from schema_migrations')).rows.map((r) => r.name as string)
    )
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(join(dir, file), 'utf8')
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into schema_migrations (name) values ($1)', [file])
        await client.query('commit')
        console.log(`[migrate] aplicada ${file}`)
      } catch (e) {
        await client.query('rollback').catch(() => {})
        console.error(`[migrate] FALLÓ ${file}:`, e instanceof Error ? e.message : e)
        return
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => {})
    client.release()
  }
}
