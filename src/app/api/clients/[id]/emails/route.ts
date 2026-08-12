import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listClientEmails, addClientEmail } from '@/lib/db/clients'

// GET /api/clients/[id]/emails — additional emails (client.email is the primary, listed separately)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const emails = await listClientEmails(params.id)
  return NextResponse.json({ emails })
}

// POST /api/clients/[id]/emails  { email, label? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { email, label } = await req.json()
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const created = await addClientEmail(params.id, email, label ?? null)
  return NextResponse.json({ email: created })
}
