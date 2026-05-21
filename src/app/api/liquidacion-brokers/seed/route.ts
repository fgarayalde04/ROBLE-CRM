import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowDef {
  concept: string
  sort_order: number
  is_formula: boolean
  formula_type: string | null
}

interface AdvisorTemplate {
  advisor: string
  company: string
  rows: RowDef[]
}

// ─── Row templates ────────────────────────────────────────────────────────────

function input(concept: string, sort_order: number): RowDef {
  return { concept, sort_order, is_formula: false, formula_type: null }
}
function formula(concept: string, sort_order: number, formula_type: string): RowDef {
  return { concept, sort_order, is_formula: true, formula_type }
}

const TEMPLATES: AdvisorTemplate[] = [
  // ── FRAN JJ — ROBLE (existing, backward-compat) ──────────────────────────
  {
    advisor: 'FRAN JJ',
    company: 'roble',
    rows: [
      input('LH2',                                    0),
      input('LH3',                                    1),
      formula('Facturacion',                          10, 'facturacion'),
      formula('40.00%',                               11, 'porcentaje_40'),
      input('Fee LH2',                                12),
      input('Fee LH3',                                13),
      formula('Sub Total',                            20, 'subtotal'),
      input('Retencion impuesto a los dividendos 7%', 21),
      input('otros',                                  22),
      formula('Total a liquidar',                     30, 'total'),
    ],
  },

  // ── JAVIER — GELIENE ─────────────────────────────────────────────────────
  {
    advisor: 'Javier',
    company: 'geliene',
    rows: [
      input('L55',                        0),
      input('L10',                        1),
      input('Fees L54',                   2),
      input('Fees L09',                   3),
      input('Maintenance fee',            4),
      formula('Facturacion',              10, 'facturacion'),
      input('55%',                       11),
      input('60%',                        12),
      input('70%',                        13),
      input('Fees L55',                   14),
      input('Fees L10',                   15),
      input('Ajuste',                     16),
      formula('Sub Total',                20, 'subtotal'),
      input('Acuerdo 2022 / Premio',      25),
      formula('Total a liquidar',         30, 'total'),
    ],
  },

  // ── JAVIER — ROBLE ───────────────────────────────────────────────────────
  {
    advisor: 'Javier',
    company: 'roble',
    rows: [
      input('L52',                                    0),
      input('L07',                                    1),
      input('Fee L51',                                2),
      input('Fee L06',                                3),
      input('Maintenance fee',                        4),
      formula('Facturacion',                          10, 'facturacion'),
      input('50%',                                    11),
      input('60%',                                    12),
      input('70%',                                    13),
      input('Fee L52',                                14),
      input('Fee L07',                                15),
      formula('Sub Total',                            20, 'subtotal'),
      input('Retencion impuesto a los dividendos',    21),
      formula('Total a liquidar',                     30, 'total'),
    ],
  },

  // ── SANDRA — GELIENE ─────────────────────────────────────────────────────
  {
    advisor: 'Sandra',
    company: 'geliene',
    rows: [
      input('L54',                        0),
      input('L09',                        1),
      input('Fees L54',                   2),
      input('Fees L09',                   3),
      input('Maintenance fee',            4),
      formula('Facturacion',              10, 'facturacion'),
      input('55,53%',                     11),
      input('70%',                        12),
      input('80%',                        13),
      input('Fees L54',                   14),
      input('Fees L09',                   15),
      input('Ajuste',                     16),
      formula('Sub Total',                20, 'subtotal'),
      input('Acuerdo 2022 / Premio',      25),
      formula('Total a liquidar',         30, 'total'),
    ],
  },

  // ── SANDRA — ROBLE ───────────────────────────────────────────────────────
  {
    advisor: 'Sandra',
    company: 'roble',
    rows: [
      input('L51',                                    0),
      input('L06',                                    1),
      input('Fee L51',                                2),
      input('Fee L06',                                3),
      input('Branaa (L50)',                           4),
      input('Maintenance fee',                        5),
      formula('Facturacion',                          10, 'facturacion'),
      input('55,53%',                                 11),
      input('50%',                                    12),
      input('70%',                                    13),
      input('80%',                                    14),
      input('Fee L51',                                15),
      input('Fee L06',                                16),
      formula('Sub Total',                            20, 'subtotal'),
      input('Retencion impuesto a los dividendos',    21),
      input('Pago BPS',                               22),
      input('Pago Sueldo',                            23),
      input('Debito acciones Insigneo',               24),
      formula('Total a liquidar',                     30, 'total'),
    ],
  },

  // ── INÉS — ROBLE ─────────────────────────────────────────────────────────
  {
    advisor: 'Inés',
    company: 'roble',
    rows: [
      input('L68',                                    0),
      input('L18',                                    1),
      formula('Facturacion',                          10, 'facturacion'),
      input('60%',                                    11),
      input('Fee L68',                                12),
      input('Fee L18',                                13),
      formula('Sub Total',                            20, 'subtotal'),
      input('Retencion impuesto a los dividendos',    21),
      input('Acuerdo / Premio',                       22),
      input('Sueldo',                                 23),
      formula('Total a liquidar',                     30, 'total'),
    ],
  },

  // ── GUILLERMO — GELIENE (no Sub Total) ───────────────────────────────────
  {
    advisor: 'Guillermo',
    company: 'geliene',
    rows: [
      input('L59',                 0),
      input('L14',                 1),
      input('Fees L54',            2),
      input('Fees L09',            3),
      input('L82',                 4),
      input('L83',                 5),
      input('Maintenance fee',     6),
      formula('Facturacion',       10, 'facturacion'),
      input('40%',                 11),
      input('60%',                 12),
      input('Fees L59',            13),
      input('Fees L14',            14),
      input('Fees L82',            15),
      input('Fees L83',            16),
      formula('Total a liquidar',  30, 'total'),
    ],
  },

  // ── GUILLERMO — ROBLE ────────────────────────────────────────────────────
  {
    advisor: 'Guillermo',
    company: 'roble',
    rows: [
      input('L60',                                    0),
      input('L15',                                    1),
      input('L72',                                    2),
      input('L73',                                    3),
      input('Maintenance fee',                        4),
      input('Fee L51',                                5),
      input('Fee L06',                                6),
      formula('Facturacion',                          10, 'facturacion'),
      input('40%',                                    11),
      input('60%',                                    12),
      input('Fee L60',                                13),
      input('Fee L15',                                14),
      input('Fee L72',                                15),
      input('Fee L73',                                16),
      formula('Sub Total',                            20, 'subtotal'),
      input('Retencion impuesto a los dividendos',    21),
      input('Acuerdo / Premio',                       22),
      formula('Total a liquidar',                     30, 'total'),
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateTable(
  advisor: string,
  company: string,
  year: number
): Promise<{ id: string } | null> {
  const { data: existing } = await supabaseAdmin
    .from('broker_settlement_tables')
    .select('id')
    .eq('advisor_name', advisor)
    .eq('company', company)
    .eq('year', year)
    .single()

  if (existing) return existing as { id: string }

  const { data: created, error } = await supabaseAdmin
    .from('broker_settlement_tables')
    .insert({ advisor_name: advisor, company, year })
    .select('id')
    .single()

  if (error || !created) return null
  return created as { id: string }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const YEAR = 2026
    const summary: { advisor: string; company: string; status: 'seeded' | 'skipped'; rows_inserted?: number }[] = []

    for (const template of TEMPLATES) {
      const { advisor, company, rows: rowDefs } = template

      const tableRecord = await getOrCreateTable(advisor, company, YEAR)
      if (!tableRecord) {
        summary.push({ advisor, company, status: 'skipped' })
        continue
      }
      const tableId = tableRecord.id

      // Check if rows already exist — skip if any rows present
      const { data: existingRows } = await supabaseAdmin
        .from('broker_settlement_rows')
        .select('id')
        .eq('table_id', tableId)

      if (existingRows && existingRows.length > 0) {
        summary.push({ advisor, company, status: 'skipped' })
        continue
      }

      // Insert all rows for this template
      const rowsToInsert = rowDefs.map(r => ({
        table_id: tableId,
        concept: r.concept,
        sort_order: r.sort_order,
        is_formula: r.is_formula,
        formula_type: r.formula_type,
      }))

      const { error: insertError } = await supabaseAdmin
        .from('broker_settlement_rows')
        .insert(rowsToInsert)

      if (insertError) {
        summary.push({ advisor, company, status: 'skipped' })
        continue
      }

      summary.push({ advisor, company, status: 'seeded', rows_inserted: rowsToInsert.length })
    }

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
