import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasPermission } from '@/lib/auth'
import { getBrowser, closeBrowser } from '@/lib/fondos/browser'
import { buildCalendarXlsx } from '@/lib/cupones/excel'
import { renderCalendarHtml } from '@/lib/cupones/html'
import { parseCalendarInput, calendarFileBase } from '@/lib/cupones/validate'
import { saveCouponCalendar } from '@/lib/db/couponCalendars'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/cupones/export { format: 'xlsx' | 'pdf', calendar, id?, clientId? }
// Guarda el calendario (en la ficha del cliente si hay clientId) y devuelve el
// archivo. El id guardado vuelve en X-Calendar-Id: la pantalla lo reenvía para
// que bajar el Excel y después el PDF no duplique el registro.

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  if (!browser) throw new Error('No se pudo iniciar el browser headless')
  const context = await browser.newContext({ viewport: { width: 1123, height: 794 } })
  try {
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForFunction(() => document.body.dataset.fit !== 'pending', null, { timeout: 10000 })
    return await page.pdf({ preferCSSPageSize: true, printBackground: true })
  } finally {
    await context.close().catch(() => {})
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!hasPermission(session.role, 'research', session.permissions)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const format = body?.format === 'pdf' ? 'pdf' : 'xlsx'
  const parsed = parseCalendarInput(body?.calendar)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const cal = parsed.calendar

  let file: Buffer
  if (format === 'xlsx') {
    file = await buildCalendarXlsx(cal)
  } else {
    // El Chromium headless a veces se cae en el primer uso tras un deploy: un reintento.
    let out: Buffer | null = null
    let lastError = ''
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try {
        out = await renderPdf(renderCalendarHtml(cal))
      } catch (e: any) {
        lastError = e?.message ?? String(e)
        console.error(`[cupones/pdf] intento ${attempt + 1} falló:`, lastError)
        await closeBrowser()
      }
    }
    if (!out) return NextResponse.json({ error: `No se pudo generar el PDF: ${lastError}` }, { status: 500 })
    file = out
  }

  let id: string | null = null
  try {
    id = await saveCouponCalendar(cal, {
      id: typeof body.id === 'string' ? body.id : null,
      clientId: typeof body.clientId === 'string' && body.clientId ? body.clientId : null,
      userName: session.name,
      userId: session.id,
    })
  } catch (e) {
    // Sin la tabla (migración pendiente) igual se descarga el archivo.
    console.error('[cupones/export] no se pudo guardar', e)
  }

  const name = `${calendarFileBase(cal.clientName)}.${format}`
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      ...(id ? { 'X-Calendar-Id': id } : {}),
    },
  })
}
