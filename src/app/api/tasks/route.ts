import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import * as tasksDb from '@/lib/db/tasks'
import { pool } from '@/lib/db/pool'

async function getCurrentUserName() {
  const session = await getSession()
  if (session?.name) return session.name
  return cookies().get('rc_user_name')?.value ?? null
}

function cleanSharedWith(value: unknown, currentUser: string | null, responsible: unknown) {
  if (!Array.isArray(value)) return []
  const responsibleName = typeof responsible === 'string' ? responsible.trim() : ''
  const blocked = new Set([currentUser ?? '', responsibleName, ''].filter(Boolean))
  return Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v && !blocked.has(v))
    )
  )
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const data = await tasksDb.getTasks({
      responsible: searchParams.get('responsible') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      clientId: searchParams.get('client_id') ?? undefined,
      openingId: searchParams.get('opening_id') ?? undefined,
      search: searchParams.get('q') ?? undefined,
    })
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUserName()
    const body = await req.json()
    const { shared_with, ...taskPayload } = body
    const sharedWith = cleanSharedWith(shared_with, currentUser, taskPayload.responsible)

    const entries = Object.entries({ ...taskPayload, created_by: currentUser }).filter(([, v]) => v !== undefined)
    const cols = entries.map(([k]) => `"${k}"`)
    const placeholders = entries.map((_, i) => `$${i + 1}`)
    const values = entries.map(([, v]) => v)
    const { rows } = await pool.query(
      `insert into tasks (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
      values
    )
    const data = rows[0]

    if (sharedWith.length > 0) {
      await tasksDb.upsertTaskShares(data.id, sharedWith, currentUser)
      await tasksDb.notifyTaskShared(sharedWith, currentUser, data.id, data.title)
    }

    await pool.query(
      `insert into activity_log (entity_type, entity_id, action, description, user_name) values ($1, $2, $3, $4, $5)`,
      ['task', data.id, 'crear', `Tarea "${data.title}" creada`, currentUser]
    )

    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const currentUser = await getCurrentUserName()
    const { id, shared_with, ...updates } = await req.json()

    if (updates.status === 'completado' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
      updates.completed_by = currentUser
    }

    const data = await tasksDb.updateTask(id, updates)

    if (Array.isArray(shared_with)) {
      const sharedWith = cleanSharedWith(shared_with, currentUser, updates.responsible ?? (data as any).responsible)
      await tasksDb.replaceTaskShares(id, sharedWith, currentUser)
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
