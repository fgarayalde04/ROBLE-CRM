import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
    const responsible = searchParams.get('responsible')
    const status = searchParams.get('status')
    const client_id = searchParams.get('client_id')
    const opening_id = searchParams.get('opening_id')
    const q = searchParams.get('q')

    let query = supabaseAdmin
      .from('tasks')
      .select('*, client:clients(id, first_name, last_name, client_number)')
      .order('due_date', { ascending: true, nullsFirst: false })

    if (responsible) query = query.eq('responsible', responsible)
    if (status) query = query.eq('status', status)
    if (client_id) query = query.eq('client_id', client_id)
    if (opening_id) query = query.eq('opening_id', opening_id)
    if (q) query = query.ilike('title', `%${q}%`)

    const { data, error } = await query
    if (error) throw error
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

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        ...taskPayload,
        created_by: currentUser,
      })
      .select()
      .single()

    if (error) throw error

    if (sharedWith.length > 0) {
      const shareRows = sharedWith.map((userName) => ({
        task_id: data.id,
        user_name: userName,
        shared_by: currentUser,
      }))
      await supabaseAdmin.from('task_shares').upsert(shareRows, {
        onConflict: 'task_id,user_name',
        ignoreDuplicates: true,
      })

      await supabaseAdmin.from('notifications').insert(
        sharedWith.map((userName) => ({
          user_name: userName,
          title: 'Tarea compartida',
          message: `${currentUser ?? 'Un usuario'} compartió contigo la tarea: ${data.title}`,
          entity_type: 'task',
          entity_id: data.id,
        }))
      )
    }

    await supabaseAdmin.from('activity_log').insert({
      entity_type: 'task',
      entity_id: data.id,
      action: 'crear',
      description: `Tarea "${data.title}" creada`,
      user_name: currentUser,
    })

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

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (Array.isArray(shared_with)) {
      const sharedWith = cleanSharedWith(shared_with, currentUser, updates.responsible ?? data.responsible)
      await supabaseAdmin.from('task_shares').delete().eq('task_id', id)
      if (sharedWith.length > 0) {
        await supabaseAdmin.from('task_shares').insert(
          sharedWith.map((userName) => ({
            task_id: id,
            user_name: userName,
            shared_by: currentUser,
          }))
        )
      }
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message ?? 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
