import { NextRequest, NextResponse } from 'next/server'
import { getSession, createSession, SESSION_COOKIE } from '@/lib/auth'
import { getPlantilla } from '@/lib/db/plantillas'
import { getBrowser, closeBrowser } from '@/lib/fondos/browser'
import { PAGINA_PLANTILLA } from '@/components/plantillas/PlantillaRender'

export const maxDuration = 60

// GET /api/plantillas/[id]/pdf — PDF con un browser headless navegando a la
// hoja para imprimir (/research/plantillas/[id]/print), igual que las propuestas.

async function renderPdf(printUrl: string, token: string, size: { width: number; height: number }): Promise<Buffer | null> {
  const browser = await getBrowser()
  if (!browser) return null
  const context = await browser.newContext()
  try {
    await context.addCookies([{ name: SESSION_COOKIE, value: token, domain: '127.0.0.1', path: '/' }])
    const page = await context.newPage()
    await page.goto(printUrl, { waitUntil: 'networkidle', timeout: 45000 })
    await page.evaluate(() => (document as any).fonts?.ready)
    return await page.pdf({ width: `${size.width}px`, height: `${size.height}px`, printBackground: true, preferCSSPageSize: true })
  } finally {
    await context.close().catch(() => {})
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const doc = await getPlantilla(params.id)
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })

  const port = process.env.PORT ?? '3000'
  const printUrl = `http://127.0.0.1:${port}/research/plantillas/${params.id}/print`
  const token = await createSession(session)

  // El Chromium headless a veces se cae en el primer uso tras un deploy; se reintenta una vez.
  let pdf: Buffer | null = null
  let lastError = 'No se pudo iniciar el browser headless'
  for (let attempt = 0; attempt < 2 && !pdf; attempt++) {
    try {
      pdf = await renderPdf(printUrl, token, PAGINA_PLANTILLA[doc.tipo])
    } catch (err: any) {
      lastError = err.message
      console.error(`[plantillas-pdf] intento ${attempt + 1} falló:`, err.message)
      await closeBrowser()
    }
  }
  if (!pdf) return NextResponse.json({ error: `No se pudo generar el PDF: ${lastError}` }, { status: 500 })

  const nombre = doc.titulo.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_') || 'documento'
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(nombre)}.pdf"; filename*=UTF-8''${encodeURIComponent(nombre)}.pdf`,
    },
  })
}
