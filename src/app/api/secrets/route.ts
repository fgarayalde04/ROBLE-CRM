// Run in Supabase SQL editor:
// CREATE TABLE secrets_vault (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   service_name TEXT NOT NULL,
//   username TEXT,
//   password TEXT,
//   category TEXT DEFAULT 'otros',
//   url TEXT,
//   company TEXT,
//   responsible TEXT,
//   notes TEXT,
//   status TEXT DEFAULT 'activa',
//   last_updated_at TIMESTAMPTZ DEFAULT NOW(),
//   expires_at DATE,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('No autenticado')
  return session
}

export async function GET() {
  try {
    await requireSession()
    const { data, error } = await supabaseAdmin
      .from('secrets_vault')
      .select('*')
      .order('service_name', { ascending: true })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: msg === 'No autenticado' ? 401 : 400 })
  }
}

export async function POST(req: Request) {
  try {
    await requireSession()
    const body = await req.json()

    const now = new Date().toISOString()
    const record = {
      service_name: body.service_name,
      username: body.username ?? null,
      password: body.password ?? null,
      category: body.category ?? 'otros',
      url: body.url ?? null,
      company: body.company ?? null,
      responsible: body.responsible ?? null,
      notes: body.notes ?? null,
      status: body.status ?? 'activa',
      expires_at: body.expires_at ?? null,
      last_updated_at: now,
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await supabaseAdmin
      .from('secrets_vault')
      .insert(record)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: msg === 'No autenticado' ? 401 : 400 })
  }
}
