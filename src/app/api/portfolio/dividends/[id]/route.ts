import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { updateDividendLedgerEntry, deleteDividendLedgerEntry } from '@/lib/db/portfolio'

// PATCH /api/portfolio/dividends/[id] — edita una fila de la planilla manual
// de dividendos (fondo, tipo, fecha, monto o notas).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as {
    fund_name?: string; entry_type?: string; entry_date?: string | null; amount?: number | null; notes?: string | null
  }
  if (body.fund_name !== undefined && !body.fund_name.trim()) {
    return NextResponse.json({ error: 'El nombre del fondo no puede quedar vacío' }, { status: 400 })
  }
  if (body.entry_type !== undefined && !['compra', 'dividendo', 'dividendo_total'].includes(body.entry_type)) {
    return NextResponse.json({ error: 'entry_type debe ser "compra", "dividendo" o "dividendo_total"' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.fund_name !== undefined) patch.fund_name = body.fund_name.trim()
  if (body.entry_type !== undefined) patch.entry_type = body.entry_type
  if (body.entry_date !== undefined) patch.entry_date = body.entry_date?.trim() || null
  if (body.amount !== undefined) patch.amount = body.amount
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null

  const entry = await updateDividendLedgerEntry(params.id, patch)
  if (!entry) return NextResponse.json({ error: 'Fila no encontrada o nada para actualizar' }, { status: 404 })
  return NextResponse.json({ ok: true, entry })
}

// DELETE /api/portfolio/dividends/[id] — borra una fila de la planilla.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await deleteDividendLedgerEntry(params.id)
  return NextResponse.json({ ok: true })
}
