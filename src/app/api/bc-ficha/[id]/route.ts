import { NextRequest, NextResponse } from 'next/server'
import { getBcFicha, updateBcFicha, deleteBcFicha } from '@/lib/db/bancoCentral'
import { getSession } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const data = await getBcFicha(params.id)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { ficha_data, perfil_data, lista_data, perfil_score, perfil_result, client_name, client_id } = body

  const update: Record<string, unknown> = {}
  if (ficha_data !== undefined) update.ficha_data = ficha_data
  if (perfil_data !== undefined) update.perfil_data = perfil_data
  if (lista_data !== undefined) update.lista_data = lista_data
  if (perfil_score !== undefined) update.perfil_score = perfil_score
  if (perfil_result !== undefined) update.perfil_result = perfil_result
  if (client_name !== undefined) update.client_name = client_name
  if (client_id !== undefined) update.client_id = client_id

  const data = await updateBcFicha(params.id, update)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  await deleteBcFicha(params.id)
  return NextResponse.json({ ok: true })
}
