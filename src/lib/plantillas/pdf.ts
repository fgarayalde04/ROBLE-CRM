import { createSession, SESSION_COOKIE, type SessionUser } from '@/lib/auth'
import { getBrowser, closeBrowser } from '@/lib/fondos/browser'
import { PAGINA_PLANTILLA } from '@/components/plantillas/PlantillaRender'
import type { TipoPlantilla } from './tipos'

// PDF de un documento de plantilla: un browser headless abre la hoja para
// imprimir (/plantillas/[id]/print) y llama a page.pdf(), igual que las propuestas.

async function render(printUrl: string, token: string, size: { width: number; height: number }): Promise<Buffer | null> {
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

export async function generarPdfPlantilla(id: string, tipo: TipoPlantilla, session: SessionUser): Promise<Buffer> {
  const port = process.env.PORT ?? '3000'
  const printUrl = `http://127.0.0.1:${port}/plantillas/${id}/print`
  const token = await createSession(session)

  // El Chromium headless a veces se cae en el primer uso tras un deploy; se reintenta una vez.
  let lastError = 'No se pudo iniciar el browser headless'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const pdf = await render(printUrl, token, PAGINA_PLANTILLA[tipo])
      if (pdf) return pdf
    } catch (err: any) {
      lastError = err.message
      console.error(`[plantillas-pdf] intento ${attempt + 1} falló:`, err.message)
      await closeBrowser()
    }
  }
  throw new Error(`No se pudo generar el PDF: ${lastError}`)
}

/** Nombre de archivo seguro para el PDF. */
export function nombreArchivo(titulo: string) {
  return (titulo.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_') || 'documento') + '.pdf'
}
