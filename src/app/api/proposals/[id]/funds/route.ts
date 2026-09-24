import { NextResponse } from 'next/server'
import { nextPosition, insertProposalLine, updateProposalLine, deleteProposalLine } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'

const TABLE = 'proposal_funds'

// Los retornos por año calendario solo se mandan si traen valor: así el alta y
// la edición de un fondo no dependen de que esas columnas existan en la base
// (migración proposal_funds_yearly_returns_migration.sql) cuando no hay años
// para guardar.
const YEAR_COLS = ['return_2025', 'return_2024', 'return_2023', 'return_2022', 'return_2021'] as const
function yearlyReturns(src: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const c of YEAR_COLS) if (src[c] != null) out[c] = src[c]
  return out
}

// Si la base todavía no tiene las columnas de años (migración pendiente en ese
// ambiente), se guarda igual todo lo demás — un guardado nunca debe perder
// YTD/1A/3A/5A por culpa de los años.
function withoutYears<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row }
  for (const c of YEAR_COLS) delete out[c]
  return out as T
}
const isMissingColumn = (e: any) => e?.code === '42703'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const position = await nextPosition(TABLE, params.id)

    const row = {
      proposal_id:      params.id,
      position,
      isin:             body.isin             ?? null,
      issuer:           body.issuer           ?? null,
      fund_name:        body.fund_name        ?? null,
      fund_class:       body.fund_class       ?? null,
      fund_category:    body.fund_category    ?? null,
      return_ytd:       body.return_ytd       ?? null,
      return_1y:        body.return_1y        ?? null,
      return_3y:        body.return_3y        ?? null,
      return_5y:        body.return_5y        ?? null,
      ...yearlyReturns(body),
      ytm_indicative:   body.ytm_indicative   ?? null,
      duration_years:   body.duration_years   ?? null,
      pct:              body.pct              ?? 0,
      amount:           body.amount           ?? 0,
      operacion:        body.operacion        ?? 'compra',
      broker:           body.broker           ?? null,
      data_source:      body.data_source      ?? 'manual',
      needs_review:     body.needs_review     ?? false,
      extraction_notes: body.extraction_notes ?? null,
    }
    let data
    try {
      data = await insertProposalLine(TABLE, row)
    } catch (e) {
      if (!isMissingColumn(e)) throw e
      data = await insertProposalLine(TABLE, withoutYears(row))
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { fund_id, ...fields } = body

    const allowed: Record<string, unknown> = {}
    const cols = ['isin','issuer','fund_name','fund_class','fund_category','return_ytd','return_1y','return_3y','return_5y','return_2025','return_2024','return_2023','return_2022','return_2021','ytm_indicative','duration_years','pct','amount','operacion','broker','needs_review','data_source']
    for (const c of cols) {
      if (fields[c] !== undefined) allowed[c] = fields[c]
    }

    let data
    try {
      data = await updateProposalLine(TABLE, fund_id, params.id, allowed)
    } catch (e) {
      if (!isMissingColumn(e)) throw e
      data = await updateProposalLine(TABLE, fund_id, params.id, withoutYears(allowed))
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    await deleteProposalLine(TABLE, searchParams.get('fund_id'), params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
