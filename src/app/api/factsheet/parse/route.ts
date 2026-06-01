import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseFactsheetExcel } from '@/lib/factsheet-parser'

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return NextResponse.json({ error: 'Formato no soportado. Usar .xlsx, .xls o .csv' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const result = parseFactsheetExcel(buffer)

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
