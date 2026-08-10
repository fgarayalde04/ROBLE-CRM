import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

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
  const { rows: existingRows } = await pool.query(
    `select id from broker_settlement_tables where advisor_name = $1 and company = $2 and year = $3`,
    [advisor, company, year]
  )
  if (existingRows[0]) return existingRows[0]

  try {
    const { rows: created } = await pool.query(
      `insert into broker_settlement_tables (advisor_name, company, year) values ($1, $2, $3) returning id`,
      [advisor, company, year]
    )
    return created[0] ?? null
  } catch {
    return null
  }
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
      const { rows: existingRows } = await pool.query(
        `select id from broker_settlement_rows where table_id = $1`,
        [tableId]
      )

      if (existingRows.length > 0) {
        summary.push({ advisor, company, status: 'skipped' })
        continue
      }

      // Insert all rows for this template
      try {
        const values: any[] = []
        const placeholders = rowDefs.map((r, i) => {
          values.push(tableId, r.concept, r.sort_order, r.is_formula, r.formula_type)
          return `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        })
        await pool.query(
          `insert into broker_settlement_rows (table_id, concept, sort_order, is_formula, formula_type) values ${placeholders.join(', ')}`,
          values
        )
      } catch {
        summary.push({ advisor, company, status: 'skipped' })
        continue
      }

      summary.push({ advisor, company, status: 'seeded', rows_inserted: rowDefs.length })
    }

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
