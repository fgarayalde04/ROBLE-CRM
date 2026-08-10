import { Pool, types } from 'pg'

// pg parses `date` and `timestamptz` into JS Date objects using the Node process's
// LOCAL timezone, which silently shifts calendar dates and breaks string comparisons
// (e.g. `row.due_date < '2026-08-10'`). Keep them as plain strings instead, matching
// what PostgREST/Supabase always returned over JSON.
types.setTypeParser(1082, (val) => val)                       // date -> 'YYYY-MM-DD'
types.setTypeParser(1114, (val) => val)                       // timestamp (no tz) -> raw string
types.setTypeParser(1184, (val) => new Date(val).toISOString()) // timestamptz -> ISO 8601

// Cached on globalThis so Next.js dev hot-reload doesn't spawn a new pool per edit.
const globalForDb = globalThis as unknown as { pgPool?: Pool }

function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL not set in .env.local')
  return new Pool({ connectionString })
}

export const pool = globalForDb.pgPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool
