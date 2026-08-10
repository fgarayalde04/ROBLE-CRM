import { NextRequest, NextResponse } from 'next/server'
import { updateSecret, deleteSecret } from '@/lib/db/secrets'
import { getSession } from '@/lib/auth'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('No autenticado')
  return session
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSession()
    const { id } = params
    const body = await request.json()

    const allowed = [
      'service_name', 'username', 'password', 'category',
      'url', 'company', 'responsible', 'notes', 'status', 'expires_at',
    ]

    const now = new Date().toISOString()
    const update: Record<string, unknown> = {
      last_updated_at: now,
      updated_at: now,
    }

    for (const key of allowed) {
      if (key in body) {
        update[key] = body[key]
      }
    }

    const data = await updateSecret(id, update)
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: msg === 'No autenticado' ? 401 : 400 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSession()
    const { id } = params

    await deleteSecret(id)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: msg === 'No autenticado' ? 401 : 400 })
  }
}
