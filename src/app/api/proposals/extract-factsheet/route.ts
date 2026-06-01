import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { extractFactsheetData } from '@/lib/factsheet-extractor'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const data = await extractFactsheetData(buffer)
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error('[extract-factsheet]', err)
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
