import { NextRequest, NextResponse } from 'next/server'
import { listBcFichas, createBcFicha } from '@/lib/db/bancoCentral'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const empresa = url.searchParams.get('empresa')
  const tipo = url.searchParams.get('tipo')

  const data = await listBcFichas(empresa, tipo)
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa, tipo_cliente, client_id, client_name, ficha_data, perfil_data, lista_data, perfil_score, perfil_result } = body

  const data = await createBcFicha({
    empresa, tipo_cliente, client_id, client_name, ficha_data, perfil_data, lista_data,
    perfil_score, perfil_result, created_by: session.id,
  })
  return NextResponse.json(data, { status: 201 })
}
