import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

interface SeedRow {
  concept: string
  expense_type: 'fijo' | 'variable'
  category: string
  mayValue?: number | null
  mayRaw?: string
}

const GELIENE_ROWS: SeedRow[] = [
  { concept: 'BSE', expense_type: 'fijo', category: 'seguros' },
  { concept: 'ALQUILER', expense_type: 'fijo', category: 'alquiler' },
  { concept: 'FACTURU/ADIUVO', expense_type: 'variable', category: 'tecnología' },
  { concept: 'DEVSYS - Cumplo 360', expense_type: 'fijo', category: 'tecnología', mayValue: 187.18 },
  { concept: 'BPS', expense_type: 'fijo', category: 'impuestos' },
  { concept: 'BPS IRPF', expense_type: 'fijo', category: 'impuestos' },
  { concept: 'SUELDO FRAN', expense_type: 'fijo', category: 'salarios', mayValue: 0.00 },
  { concept: 'SUELDO MARIA', expense_type: 'fijo', category: 'salarios', mayValue: 1101.00 },
  { concept: 'SUELDO ISABEL', expense_type: 'fijo', category: 'salarios', mayValue: 1129.00 },
  { concept: 'SUELDO GIANFRANCO', expense_type: 'fijo', category: 'salarios', mayValue: 0.00 },
  { concept: 'CHADICOV', expense_type: 'variable', category: 'proveedores' },
  { concept: 'DEVELOP SAS', expense_type: 'variable', category: 'tecnología' },
  { concept: 'TESTA', expense_type: 'fijo', category: 'tecnología' },
]

const ROBLE_ROWS: SeedRow[] = [
  { concept: 'BSE', expense_type: 'fijo', category: 'seguros', mayValue: 27.19 },
  { concept: 'ALQUILER', expense_type: 'fijo', category: 'alquiler', mayValue: 2791.10 },
  { concept: 'GASTOS COMUNES', expense_type: 'fijo', category: 'oficina', mayValue: 407.89 },
  { concept: 'SUELDO ISABEL', expense_type: 'fijo', category: 'salarios', mayValue: 849.00 },
  { concept: 'SUELDO MARIA', expense_type: 'fijo', category: 'salarios', mayValue: 2262.00 },
  { concept: 'SUELDO FRAN', expense_type: 'fijo', category: 'salarios', mayValue: 0.00 },
  { concept: 'SUELDO INES', expense_type: 'fijo', category: 'salarios', mayValue: 205.00 },
  { concept: 'FACTURU/ADIUVO', expense_type: 'variable', category: 'tecnología' },
  { concept: 'SERZA', expense_type: 'variable', category: 'proveedores', mayValue: 147.67 },
  { concept: 'TCC', expense_type: 'variable', category: 'proveedores', mayValue: 58.54 },
  { concept: 'Honorarios Chino', expense_type: 'variable', category: 'legales', mayValue: 1220.00 },
  { concept: 'Cumplo 360', expense_type: 'fijo', category: 'tecnología', mayValue: 151.99 },
  { concept: 'BPS', expense_type: 'fijo', category: 'impuestos' },
  { concept: 'BPS IRPF', expense_type: 'fijo', category: 'impuestos' },
  { concept: 'ANTEL', expense_type: 'fijo', category: 'servicios', mayValue: null, mayRaw: '?' },
  { concept: 'MOVISTAR', expense_type: 'fijo', category: 'servicios' },
  { concept: 'TESTA-DYNATECH', expense_type: 'fijo', category: 'tecnología', mayValue: 122.00 },
  { concept: 'TESTA', expense_type: 'fijo', category: 'tecnología', mayValue: 268.00 },
  { concept: 'SBZ', expense_type: 'variable', category: 'proveedores', mayValue: 116.00 },
  { concept: 'DGI', expense_type: 'fijo', category: 'impuestos' },
  { concept: 'PLUSULTRA', expense_type: 'variable', category: 'proveedores', mayValue: 168.00 },
  { concept: 'CHADICOV', expense_type: 'variable', category: 'proveedores' },
  { concept: 'SUB-TOTAL', expense_type: 'variable', category: 'otros' },
  { concept: 'Leasing', expense_type: 'fijo', category: 'otros', mayValue: 445.00 },
  { concept: 'FIX IT', expense_type: 'variable', category: 'servicios' },
  { concept: 'San Nicolas', expense_type: 'variable', category: 'proveedores', mayValue: 279.95 },
  { concept: 'Alto Palermo', expense_type: 'variable', category: 'proveedores', mayValue: 7.59 },
  { concept: 'Integrals', expense_type: 'variable', category: 'proveedores', mayValue: 364.78 },
  { concept: 'Glide (gorros)', expense_type: 'variable', category: 'marketing', mayValue: 463.08 },
]

async function seedCompany(
  company: string,
  year: number,
  exchangeRate: number,
  seedRows: SeedRow[]
) {
  // Check if already exists
  const { data: existing } = await supabaseAdmin
    .from('monthly_payment_tables')
    .select('id')
    .eq('company', company)
    .eq('year', year)
    .single()

  if (existing) {
    return { skipped: true, company, year }
  }

  // Create table
  const { data: table, error: tableError } = await supabaseAdmin
    .from('monthly_payment_tables')
    .insert({ company, year, exchange_rate: exchangeRate })
    .select()
    .single()

  if (tableError || !table) {
    throw new Error(`Failed to create table for ${company} ${year}: ${tableError?.message}`)
  }

  // Create rows
  const rowsToInsert = seedRows.map((r, idx) => ({
    table_id: table.id,
    concept: r.concept,
    expense_type: r.expense_type,
    category: r.category,
    sort_order: idx,
  }))

  const { data: insertedRows, error: rowsError } = await supabaseAdmin
    .from('monthly_payment_rows')
    .insert(rowsToInsert)
    .select()

  if (rowsError || !insertedRows) {
    throw new Error(`Failed to insert rows: ${rowsError?.message}`)
  }

  // Insert may values
  const valuesToInsert: {
    row_id: string
    month: string
    value: number | null
    raw_value: string
  }[] = []

  for (let i = 0; i < seedRows.length; i++) {
    const sr = seedRows[i]
    const insertedRow = insertedRows[i]

    if (sr.mayRaw !== undefined) {
      // Explicit raw_value (e.g. "?")
      valuesToInsert.push({
        row_id: insertedRow.id,
        month: 'mayo',
        value: null,
        raw_value: sr.mayRaw,
      })
    } else if (sr.mayValue !== undefined) {
      valuesToInsert.push({
        row_id: insertedRow.id,
        month: 'mayo',
        value: sr.mayValue,
        raw_value: String(sr.mayValue),
      })
    }
  }

  if (valuesToInsert.length > 0) {
    const { error: valError } = await supabaseAdmin
      .from('monthly_payment_values')
      .insert(valuesToInsert)

    if (valError) {
      throw new Error(`Failed to insert values: ${valError.message}`)
    }
  }

  return { seeded: true, company, year, rowCount: insertedRows.length, valueCount: valuesToInsert.length }
}

export async function POST() {
  try {
    const results = await Promise.all([
      seedCompany('geliene', 2026, 39.65, GELIENE_ROWS),
      seedCompany('roble', 2026, 39.65, ROBLE_ROWS),
    ])
    return NextResponse.json({ success: true, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
