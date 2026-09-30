import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { setInstrumentRiskManual } from '@/lib/db/instruments'
import { RISK_GROUPS, type RiskGroup } from '@/lib/riskGroups'

// PUT /api/instruments/[id]/riesgo — ajuste manual del grupo de riesgo.
// Body: { grupo: RiskGroup, motivo: string } | { grupo: null } (vuelve al automático)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { grupo, motivo } = await req.json() as { grupo: RiskGroup | null; motivo?: string }
  if (grupo !== null && !(grupo in RISK_GROUPS)) {
    return NextResponse.json({ error: 'Grupo de riesgo inválido' }, { status: 400 })
  }
  const motivoLimpio = motivo?.trim() || null
  if (grupo !== null && !motivoLimpio) {
    return NextResponse.json({ error: 'El ajuste manual necesita un motivo' }, { status: 400 })
  }

  try {
    const data = await setInstrumentRiskManual(params.id, grupo, motivoLimpio, session.name)
    if (!data) return NextResponse.json({ error: 'Instrumento no encontrado' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
