import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSession, hasPermission } from '@/lib/auth'
import { parseIncomingCash, IncomingCashError } from '@/lib/cupones/parse'
import { findClientByAccount } from '@/lib/db/couponCalendars'

export const dynamic = 'force-dynamic'

// POST /api/cupones/parse (multipart: file) — lee el "Incoming Cash" de Pershing
// y devuelve los bonos agrupados + el cliente dueño de la cuenta, si se encuentra.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'research', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: 'El archivo tiene que ser el .xlsx del reporte "Incoming Cash" de Pershing.' }, { status: 400 })
  }

  const grid: unknown[][] = []
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any)
    const ws = wb.worksheets[0]
    if (!ws) throw new IncomingCashError('El archivo no tiene hojas.')
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const values: unknown[] = []
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        const v = cell.value as any
        values[c - 1] = v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? v.richText?.map((t: any) => t.text).join('') ?? null) : v
      })
      grid[r - 1] = values
    })
  } catch (e) {
    if (e instanceof IncomingCashError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'No se pudo leer el archivo. ¿Es un .xlsx válido?' }, { status: 400 })
  }

  try {
    const report = parseIncomingCash(grid)
    const client = await findClientByAccount(report.accountNumber)
    return NextResponse.json({ report, client })
  } catch (e) {
    if (e instanceof IncomingCashError) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('[cupones/parse]', e)
    return NextResponse.json({ error: 'Error leyendo el reporte' }, { status: 500 })
  }
}
